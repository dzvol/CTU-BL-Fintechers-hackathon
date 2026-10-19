import { inspect } from 'node:util';
import { newId } from '@semanticauth/contracts';
import { getAddress, recoverTypedDataAddress, verifyTypedData, zeroAddress } from 'viem';
import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePaymentSignature, X402PaymentPayloadSchema } from '../x402';
import {
  createEoaSigner,
  Eip3009AuthorizationSchema,
  loadSignerConfig,
  SIGNER_PROFILE,
  SignedPaymentPayloadSchema,
} from './index';
import type {
  SignerConfig,
  SignPaymentInput,
  SignPaymentResult,
  SignedPaymentPayload,
} from './index';

// Fresh, unfunded, synthetic key. These tests never load a real wallet or contact a network.
const testKey = generatePrivateKey();
const sponsor = privateKeyToAccount(testKey).address;
const recipient = '0x1111111111111111111111111111111111111111';
const token = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const time = new Date('2026-10-19T12:00:00.000Z');

// Independent standard fixture, used to recover the signer of actual EIP-712 signatures.
const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;
const domain = { name: 'USDC', version: '2', chainId: 84532, verifyingContract: token } as const;
const invalidExtras: SignPaymentInput['requirements']['extra'][] = [
  undefined,
  {},
  { name: 'Fake USDC', version: '2' },
  { name: 'USDC', version: '1' },
  { name: 'USDC', version: '2', assetTransferMethod: 'permit2' },
];

function input(): SignPaymentInput {
  const operationId = newId('op');
  return {
    operation: {
      id: operationId,
      url: 'https://merchant.example/market-data',
      state: 'reserved',
      verdict: 'ALLOW',
      offer: {
        scheme: 'exact',
        network: 'base-sepolia',
        asset: token,
        payTo: recipient,
        amount: '10000',
        resourceUrl: 'https://merchant.example/market-data',
      },
    },
    reservation: { operationId, state: 'reserved', amount: 10000n },
    requirements: {
      scheme: 'exact',
      network: 'eip155:84532',
      asset: token,
      payTo: recipient,
      amount: '10000',
      maxTimeoutSeconds: 120,
      extra: { name: 'USDC', version: '2' },
    },
  };
}

function setup(config: SignerConfig = {}) {
  const readPrivateKey = vi.fn(() => testKey);
  return { signer: createEoaSigner(config, { readPrivateKey, now: () => time }), readPrivateKey };
}

function signed(result: SignPaymentResult): SignedPaymentPayload {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected a signed payment');
  return result.paymentPayload;
}

function message(payment: SignedPaymentPayload) {
  const auth = payment.payload.authorization;
  return {
    from: getAddress(auth.from),
    to: getAddress(auth.to),
    value: BigInt(auth.value),
    validAfter: BigInt(auth.validAfter),
    validBefore: BigInt(auth.validBefore),
    nonce: auth.nonce as Hex,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('EOA Signer', () => {
  it('creates a real, recoverable EIP-3009/EIP-712 signature for the approved payment', async () => {
    const { signer } = setup();
    const original = input();
    const before = structuredClone(original);
    const payment = signed(await signer.signPayment(original));
    expect(payment).toMatchObject({
      x402Version: 2,
      resource: { url: original.operation.offer.resourceUrl },
      accepted: original.requirements,
      payload: {
        authorization: {
          from: sponsor,
          to: recipient,
          value: '10000',
          validAfter: '0',
          validBefore: String(Math.floor(time.getTime() / 1000) + 120),
        },
      },
    });
    expect(payment.payload.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(payment.payload.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(SignedPaymentPayloadSchema.safeParse(payment).success).toBe(true);
    const address = await recoverTypedDataAddress({
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message: message(payment),
      signature: payment.payload.signature as Hex,
    });
    expect(address).toBe(sponsor);
    expect(original).toEqual(before);
  });

  it('returns a JSON-safe payload accepted by the existing x402 header encoder', async () => {
    const { signer } = setup();
    const payment = signed(await signer.signPayment(input()));
    const decoded: unknown = JSON.parse(
      Buffer.from(encodePaymentSignature(payment), 'base64').toString('utf8'),
    );
    expect(decoded).toEqual(payment);
    expect(X402PaymentPayloadSchema.safeParse(decoded).success).toBe(true);
  });

  it('preserves exact atomic units beyond JavaScript number precision', async () => {
    const { signer } = setup();
    const value = input();
    const amount = 900719925474099312345n;
    value.operation.offer.amount = amount.toString();
    value.requirements.amount = amount.toString();
    value.reservation.amount = amount;
    const payment = signed(await signer.signPayment(value));
    expect(payment.payload.authorization.value).toBe(amount.toString());
    expect(
      await verifyTypedData({
        address: sponsor,
        domain,
        types,
        primaryType: 'TransferWithAuthorization',
        message: message(payment),
        signature: payment.payload.signature as Hex,
      }),
    ).toBe(true);
  });

  it('uses the stricter of local lifetime and merchant maxTimeoutSeconds', async () => {
    const { signer } = setup({ authorizationTtlSeconds: 90 });
    const value = input();
    value.requirements.maxTimeoutSeconds = 30;
    const payment = signed(await signer.signPayment(value));
    expect(payment.payload.authorization.validBefore).toBe(
      String(Math.floor(time.getTime() / 1000) + 30),
    );
    value.requirements.maxTimeoutSeconds = 600;
    const next = signed(await signer.signPayment(value));
    expect(next.payload.authorization.validBefore).toBe(
      String(Math.floor(time.getTime() / 1000) + 90),
    );
  });

  it('generates independent random nonces for different operations while reusing the shared EOA', async () => {
    const { signer, readPrivateKey } = setup();
    const payments = await Promise.all(
      Array.from({ length: 5 }, async () => signed(await signer.signPayment(input()))),
    );
    expect(new Set(payments.map((value) => value.payload.authorization.nonce)).size).toBe(5);
    expect(new Set(payments.map((value) => value.payload.authorization.from))).toEqual(
      new Set([sponsor]),
    );
    expect(readPrivateKey).toHaveBeenCalledTimes(1);
  });

  it.each(['state', 'verdict', 'reservation'])(
    'requires an authorized reserved operation: %s',
    async (field) => {
      const { signer } = setup();
      const value = input();
      const invalid =
        field === 'reservation'
          ? { ...value, reservation: { ...value.reservation, state: 'spent' } }
          : {
              ...value,
              operation: { ...value.operation, [field]: field === 'state' ? 'unknown' : 'REVIEW' },
            };
      expect(await signer.signPayment(invalid as SignPaymentInput)).toEqual({
        ok: false,
        reason: 'invalid_input',
      });
    },
  );

  it('rejects a reservation for a different operation or amount', async () => {
    const { signer } = setup();
    const value = input();
    value.reservation.operationId = newId('op');
    expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'reservation_mismatch' });
    value.reservation.operationId = value.operation.id;
    value.reservation.amount = 9999n;
    expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'reservation_mismatch' });
  });

  it.each(['scheme', 'network', 'asset'])(
    'rejects an unsupported merchant payment profile: %s',
    async (field) => {
      const { signer } = setup();
      const value = input();
      value.requirements[field] = { scheme: 'upto', network: 'eip155:8453', asset: recipient }[
        field
      ]!;
      expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'unsupported_offer' });
    },
  );

  it('rejects an unsupported token even if the normalized offer and merchant both claim it', async () => {
    const { signer } = setup();
    const value = input();
    value.operation.offer.asset = recipient;
    value.requirements.asset = recipient;
    expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'unsupported_offer' });
  });

  it.each(invalidExtras)(
    'rejects absent/mismatched EIP-712 domains or unsupported transfer methods: %#',
    async (extra) => {
      const { signer } = setup();
      const value = input();
      value.requirements.extra = extra;
      expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'unsupported_offer' });
    },
  );

  it('accepts explicit eip3009 transfer metadata', async () => {
    const { signer } = setup();
    const value = input();
    value.requirements.extra = { name: 'USDC', version: '2', assetTransferMethod: 'eip3009' };
    expect((await signer.signPayment(value)).ok).toBe(true);
  });

  it.each(['amount', 'payTo'])(
    'rejects a merchant option changed after approval: %s',
    async (field) => {
      const { signer } = setup();
      const value = input();
      value.requirements[field] = field === 'amount' ? '20000' : sponsor;
      expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'offer_mismatch' });
    },
  );

  it('rejects a resource URL different from the approved operation', async () => {
    const { signer } = setup();
    const value = input();
    value.operation.offer.resourceUrl = 'https://different-merchant.example/data';
    expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'offer_mismatch' });
  });

  it.each(['0', '-1', '0.01', '1e6', (1n << 256n).toString()])(
    'rejects zero, invalid, or overflowing amounts: %s',
    async (amount) => {
      const { signer } = setup();
      const value = input();
      value.operation.offer.amount = amount;
      value.requirements.amount = amount;
      expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'invalid_input' });
    },
  );

  it('rejects a zero recipient and a nonpositive merchant lifetime', async () => {
    const { signer } = setup();
    const value = input();
    value.operation.offer.payTo = zeroAddress;
    value.requirements.payTo = zeroAddress;
    expect(await signer.signPayment(value)).toEqual({ ok: false, reason: 'invalid_input' });
    const second = input();
    second.requirements.maxTimeoutSeconds = 0;
    expect(await signer.signPayment(second)).toEqual({ ok: false, reason: 'invalid_input' });
  });

  it('does not let caller-supplied fields change the payer or fixed signing domain', async () => {
    const { signer } = setup();
    const value = { ...input(), from: recipient, privateKey: 'ignored', domain: { chainId: 8453 } };
    const payment = signed(await signer.signPayment(value));
    expect(payment.payload.authorization.from).toBe(sponsor);
    expect(
      await verifyTypedData({
        address: sponsor,
        domain,
        types,
        primaryType: 'TransferWithAuthorization',
        message: message(payment),
        signature: payment.payload.signature as Hex,
      }),
    ).toBe(true);
    expect(
      await verifyTypedData({
        address: sponsor,
        domain: { ...domain, chainId: 8453 },
        types,
        primaryType: 'TransferWithAuthorization',
        message: message(payment),
        signature: payment.payload.signature as Hex,
      }),
    ).toBe(false);
  });

  it('cryptographically binds recipient, amount, validity, nonce, and token contract', async () => {
    const { signer } = setup();
    const payment = signed(await signer.signPayment(input()));
    const original = message(payment);
    const changes: ReturnType<typeof message>[] = [
      { ...original, to: sponsor },
      { ...original, from: recipient },
      { ...original, value: original.value + 1n },
      { ...original, validBefore: original.validBefore + 1n },
      { ...original, nonce: `0x${'00'.repeat(32)}` as Hex },
    ];
    for (const changed of changes) {
      expect(
        await verifyTypedData({
          address: sponsor,
          domain,
          types,
          primaryType: 'TransferWithAuthorization',
          message: changed,
          signature: payment.payload.signature as Hex,
        }),
      ).toBe(false);
    }
    expect(
      await verifyTypedData({
        address: sponsor,
        domain: { ...domain, verifyingContract: recipient },
        types,
        primaryType: 'TransferWithAuthorization',
        message: original,
        signature: payment.payload.signature as Hex,
      }),
    ).toBe(false);
  });

  it('keeps the private key/account out of the public interface, output, and logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { signer } = setup();
    const payment = signed(await signer.signPayment(input()));
    expect(Object.keys(signer).sort()).toEqual(['address', 'signPayment']);
    expect(Object.isFrozen(signer)).toBe(true);
    expect(JSON.parse(JSON.stringify(signer))).toEqual({ address: sponsor });
    expect(inspect(signer)).not.toContain(testKey.slice(2));
    expect(JSON.stringify(payment)).not.toContain(testKey.slice(2));
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the server environment secret without returning it from configuration', () => {
    vi.stubEnv('SPONSOR_PRIVATE_KEY', testKey);
    const signer = createEoaSigner();
    expect(signer.address).toBe(sponsor);
    expect(loadSignerConfig({ SPONSOR_PRIVATE_KEY: testKey })).not.toHaveProperty('privateKey');
    expect(JSON.stringify(loadSignerConfig({ SPONSOR_PRIVATE_KEY: testKey }))).not.toContain(
      testKey,
    );
  });

  it('accepts the unprefixed private key commonly exported by wallets', () => {
    expect(createEoaSigner({}, { readPrivateKey: () => ` ${testKey.slice(2)}\n` }).address).toBe(
      sponsor,
    );
  });

  it.each([
    undefined,
    '',
    'invalid-key',
    `0x${'00'.repeat(32)}`,
    `0x${'ff'.repeat(32)}`,
    { secret: testKey },
  ])('fails closed with a sanitized error for absent or invalid server secrets: %#', (value) => {
    expect(() => createEoaSigner({}, { readPrivateKey: () => value })).toThrow(
      'Sponsor wallet secret is missing or invalid',
    );
  });

  it('sanitizes secret-provider exceptions without retaining their cause', () => {
    const providerError = new Error(`Secret provider rejected ${testKey}`);
    let caught: unknown;
    try {
      createEoaSigner(
        {},
        {
          readPrivateKey: () => {
            throw providerError;
          },
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(inspect(caught)).not.toContain(testKey.slice(2));
    expect(caught).not.toHaveProperty('cause');
  });

  it('checks the configured public sponsor address', () => {
    expect(setup({ expectedAddress: sponsor }).signer.address).toBe(sponsor);
    expect(() => setup({ expectedAddress: recipient })).toThrow(
      'Sponsor wallet address does not match configuration',
    );
  });

  it.each([new Date('invalid'), new Date(-1000)])(
    'fails safely when the server clock is invalid: %#',
    async (date) => {
      const signer = createEoaSigner({}, { readPrivateKey: () => testKey, now: () => date });
      expect(await signer.signPayment(input())).toEqual({ ok: false, reason: 'signing_failed' });
    },
  );

  it('sanitizes errors during authorization preparation', async () => {
    const signer = createEoaSigner(
      {},
      {
        readPrivateKey: () => testKey,
        now: () => {
          throw new Error(testKey);
        },
      },
    );
    expect(await signer.signPayment(input())).toEqual({ ok: false, reason: 'signing_failed' });
  });

  it('validates the public authorization schema without throwing on non-integer values', () => {
    expect(
      Eip3009AuthorizationSchema.safeParse({
        from: sponsor,
        to: recipient,
        value: 'oops',
        validAfter: '0',
        validBefore: '10',
        nonce: `0x${'11'.repeat(32)}`,
      }).success,
    ).toBe(false);
  });
});

describe('Signer configuration', () => {
  it('loads only public configuration and defaults the lifetime', () => {
    expect(loadSignerConfig({})).toEqual({
      network: 'base-sepolia',
      expectedAddress: undefined,
      authorizationTtlSeconds: 120,
    });
    expect(
      loadSignerConfig({ SPONSOR_ADDRESS: sponsor, SIGNER_AUTHORIZATION_TTL_SECONDS: '60' }),
    ).toEqual({ network: 'base-sepolia', expectedAddress: sponsor, authorizationTtlSeconds: 60 });
    expect(SIGNER_PROFILE.chainId).toBe(84532);
  });

  it.each([
    { SIGNER_AUTHORIZATION_TTL_SECONDS: '0' },
    { SIGNER_AUTHORIZATION_TTL_SECONDS: '3601' },
    { SIGNER_AUTHORIZATION_TTL_SECONDS: 'NaN' },
    { SPONSOR_ADDRESS: 'invalid' },
  ])('rejects invalid public environment configuration: %#', (source) => {
    expect(() => loadSignerConfig(source)).toThrow('Invalid Signer configuration');
  });

  it('rejects a non-MVP network before loading any secret', () => {
    const readPrivateKey = vi.fn(() => testKey);
    expect(() =>
      createEoaSigner({ network: 'base-mainnet' } as unknown as SignerConfig, { readPrivateKey }),
    ).toThrow('Invalid Signer configuration');
    expect(readPrivateKey).not.toHaveBeenCalled();
  });
});
