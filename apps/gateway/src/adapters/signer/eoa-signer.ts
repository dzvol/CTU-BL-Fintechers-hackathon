import { randomBytes } from 'node:crypto';
import { getAddress, zeroAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PAYMENT_PROFILES, type PaymentProfile } from './config';
import { SignerConfigSchema, SignPaymentInputSchema, SignedPaymentPayloadSchema } from './schemas';
import type { SignerConfig, SignPaymentInput, SignPaymentResult } from './schemas';

export interface Signer {
  /** Public sponsor address. The account and its signing methods stay inside the adapter. */
  readonly address: Address;
  /** The one network this Signer signs for (PAYMENT_NETWORK). */
  readonly profile: Readonly<PaymentProfile>;
  /** Internal use by PaymentGateway only, after ALLOW and a committed reservation. */
  signPayment(input: SignPaymentInput): Promise<SignPaymentResult>;
}

export interface SignerDependencies {
  /** Server secret provider. Defaults to SPONSOR_PRIVATE_KEY; never sent through request arguments. */
  readPrivateKey?: () => unknown;
  now?: () => Date;
}

export const EIP3009_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

const equalAddress = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

function loadAccount(readPrivateKey: () => unknown) {
  try {
    const secret = readPrivateKey();
    if (typeof secret !== 'string') throw new Error();
    const trimmed = secret.trim();
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) throw new Error();
    const key = (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex;
    return privateKeyToAccount(key);
  } catch {
    // Crypto/provider exceptions can contain the supplied key. Never retain their message or cause.
    throw new Error('Sponsor wallet secret is missing or invalid');
  }
}

/** Shared server-side EOA. It signs locally and never broadcasts, reads the DB, or calls an RPC. */
export function createEoaSigner(
  config: SignerConfig = {},
  dependencies: SignerDependencies = {},
): Signer {
  const parsed = SignerConfigSchema.safeParse(config);
  if (!parsed.success) throw new Error('Invalid Signer configuration');
  const options = parsed.data;
  const account = loadAccount(
    dependencies.readPrivateKey ?? (() => process.env.SPONSOR_PRIVATE_KEY),
  );
  if (options.expectedAddress && !equalAddress(account.address, options.expectedAddress)) {
    throw new Error('Sponsor wallet address does not match configuration');
  }
  const now = dependencies.now ?? (() => new Date());
  const profile = PAYMENT_PROFILES[options.network];

  return Object.freeze({
    address: account.address,
    profile,
    async signPayment(input: SignPaymentInput): Promise<SignPaymentResult> {
      const validated = SignPaymentInputSchema.safeParse(input);
      if (!validated.success) return { ok: false, reason: 'invalid_input' };
      const { operation, reservation, requirements } = validated.data;
      const { offer } = operation;
      const extra = requirements.extra;
      if (
        requirements.scheme !== profile.scheme ||
        requirements.network !== profile.network ||
        offer.network !== profile.id ||
        !equalAddress(requirements.asset, profile.token) ||
        !equalAddress(offer.asset, profile.token) ||
        extra?.name !== profile.domainName ||
        extra.version !== profile.domainVersion ||
        (extra.assetTransferMethod !== undefined && extra.assetTransferMethod !== 'eip3009')
      ) {
        return { ok: false, reason: 'unsupported_offer' };
      }
      const amount = BigInt(offer.amount);
      if (amount <= 0n || amount >= 1n << 256n || equalAddress(offer.payTo, zeroAddress)) {
        return { ok: false, reason: 'invalid_input' };
      }
      if (
        requirements.amount !== offer.amount ||
        !equalAddress(requirements.payTo, offer.payTo) ||
        operation.url !== offer.resourceUrl
      ) {
        return { ok: false, reason: 'offer_mismatch' };
      }
      if (reservation.operationId !== operation.id || reservation.amount !== amount) {
        return { ok: false, reason: 'reservation_mismatch' };
      }

      try {
        const timestamp = Math.floor(now().getTime() / 1000);
        if (!Number.isSafeInteger(timestamp) || timestamp < 0)
          return { ok: false, reason: 'signing_failed' };
        const ttl = Math.min(options.authorizationTtlSeconds, requirements.maxTimeoutSeconds);
        const authorization = {
          from: account.address,
          to: getAddress(offer.payTo),
          value: offer.amount,
          // Matches the x402 EIP-3009 profile and avoids a future lower bound from clock skew.
          validAfter: '0',
          validBefore: String(timestamp + ttl),
          nonce: `0x${randomBytes(32).toString('hex')}` as Hex,
        };
        const signature = await account.signTypedData({
          domain: {
            name: profile.domainName,
            version: profile.domainVersion,
            chainId: profile.chainId,
            verifyingContract: profile.token,
          },
          types: EIP3009_AUTHORIZATION_TYPES,
          primaryType: 'TransferWithAuthorization',
          message: {
            from: account.address,
            to: authorization.to,
            value: amount,
            validAfter: 0n,
            validBefore: BigInt(authorization.validBefore),
            nonce: authorization.nonce,
          },
        });
        const output = SignedPaymentPayloadSchema.safeParse({
          x402Version: 2,
          resource: { url: offer.resourceUrl },
          accepted: requirements,
          payload: { signature, authorization },
        });
        return output.success
          ? { ok: true, paymentPayload: output.data }
          : { ok: false, reason: 'signing_failed' };
      } catch {
        return { ok: false, reason: 'signing_failed' };
      }
    },
  });
}
