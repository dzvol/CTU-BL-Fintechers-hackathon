import { AddressSchema, AmountSchema, type NormalizedOffer } from '@semanticauth/contracts';
import type { PaymentProfile } from '../../adapters/signer';
import type { X402PaymentRequired, X402PaymentRequirements } from '../../adapters/x402';
import type { ScreenState } from '../../domain/jev/state';

/** Caps on stored merchant text: enough to read, too little to bloat the operations table. */
const MAX = { serviceName: 200, description: 2_000, details: 4_000 };
const cap = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** The x402 option the gateway would pay, as Policy sees it plus the raw option for the signer. */
export interface SelectedOffer {
  offer: NormalizedOffer;
  requirements: X402PaymentRequirements;
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Exactly what the Signer will sign: `exact` on the configured network in its native USDC with
 * that contract's EIP-712 domain. Checked here, before Jev, so an unsupported offer costs nothing.
 */
function isSupported(option: X402PaymentRequirements, profile: PaymentProfile): boolean {
  const { extra } = option;
  return (
    option.scheme === profile.scheme &&
    option.network === profile.network &&
    sameAddress(option.asset, profile.token) &&
    AddressSchema.safeParse(option.payTo).success &&
    AmountSchema.safeParse(option.amount).success &&
    BigInt(option.amount) > 0n &&
    extra?.name === profile.domainName &&
    extra.version === profile.domainVersion &&
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
  profile: PaymentProfile,
): SelectedOffer | undefined {
  const requirements = paymentRequired.accepts.find((option) => isSupported(option, profile));
  if (!requirements) return undefined;
  return {
    requirements,
    offer: {
      scheme: 'exact',
      network: profile.id,
      asset: requirements.asset,
      payTo: requirements.payTo,
      amount: requirements.amount,
      resourceUrl: new URL(requestedUrl).toString(),
    },
  };
}

/**
 * The offer plus the merchant text Screen read, so the dashboard can show the user what the
 * agent is buying. Stored on the operation only: Policy, facts and Judge read the payment fields,
 * and MCP results never carry the offer.
 */
export function withMerchantText(
  offer: NormalizedOffer,
  screenState: ScreenState,
): NormalizedOffer {
  const { serviceName, description } = screenState.resource;
  const body = screenState.response_body_excerpt;
  return {
    ...offer,
    ...(serviceName && { serviceName: cap(serviceName, MAX.serviceName) }),
    ...(description && { description: cap(description, MAX.description) }),
    ...(body !== undefined && { details: cap(JSON.stringify(body, null, 2), MAX.details) }),
  };
}
