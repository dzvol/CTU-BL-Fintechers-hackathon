import { AddressSchema, AmountSchema, type NormalizedOffer } from '@semanticauth/contracts';
import { SIGNER_PROFILE } from '../../adapters/signer';
import type { X402PaymentRequired, X402PaymentRequirements } from '../../adapters/x402';

/** The x402 option the gateway would pay, as Policy sees it plus the raw option for the signer. */
export interface SelectedOffer {
  offer: NormalizedOffer;
  requirements: X402PaymentRequirements;
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Exactly what the Signer will sign: `exact` on Base Sepolia in native USDC with the USDC
 * EIP-712 domain. Checked here, before Jev, so an unsupported offer costs nothing.
 */
function isSupported(option: X402PaymentRequirements): boolean {
  const { extra } = option;
  return (
    option.scheme === SIGNER_PROFILE.scheme &&
    option.network === SIGNER_PROFILE.network &&
    sameAddress(option.asset, SIGNER_PROFILE.token) &&
    AddressSchema.safeParse(option.payTo).success &&
    AmountSchema.safeParse(option.amount).success &&
    BigInt(option.amount) > 0n &&
    extra?.name === SIGNER_PROFILE.domainName &&
    extra.version === SIGNER_PROFILE.domainVersion &&
    (extra.assetTransferMethod === undefined || extra.assetTransferMethod === 'eip3009')
  );
}

/**
 * Picks the first option in `accepts` that matches the supported profile and builds the
 * NormalizedOffer. Undefined when none matches, which blocks with `unsupported_offer`.
 *
 * The offer is for `requestedUrl`, the URL the gateway fetched and pays for (Signer and transport
 * both insist on it). The merchant's own `resource.url` and description are merchant text: behind
 * a proxy the URL may differ in scheme or host, and only Screen reads them.
 */
export function selectOffer(
  paymentRequired: X402PaymentRequired,
  requestedUrl: string,
): SelectedOffer | undefined {
  const requirements = paymentRequired.accepts.find(isSupported);
  if (!requirements) return undefined;
  return {
    requirements,
    offer: {
      scheme: 'exact',
      network: 'base-sepolia',
      asset: requirements.asset,
      payTo: requirements.payTo,
      amount: requirements.amount,
      resourceUrl: new URL(requestedUrl).toString(),
    },
  };
}
