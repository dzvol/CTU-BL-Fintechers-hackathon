import type { Operation } from '@semanticauth/contracts';

/** Display only facts present in the dashboard contract; delivery does not prove payment. */
export function paymentLabel(op: Operation): string {
  if (op.settlement) return 'Settled · evidence available';
  if (op.reason === 'free_content') return 'Free · no payment';
  switch (op.state) {
    case 'blocked':
      return 'Blocked before payment';
    case 'awaiting_review':
      return 'Awaiting review · unsigned';
    case 'reserved':
    case 'prepared':
      return 'Reserved · funds held';
    case 'issued':
      return 'Issued · counts as spent';
    case 'submitted':
      return 'Submitted · counts as spent';
    case 'unknown':
      return 'Outcome unknown · counts as spent';
    default:
      return 'Not reported';
  }
}
export function deliveryLabel(op: Operation): string {
  if (op.state === 'delivered') return 'Delivered';
  if (op.state === 'delivery_failed') return 'Delivery failed';
  if (op.state === 'blocked') return 'Not started';
  return 'Not reported';
}
export function operationHost(op: Operation): string {
  return new URL(op.url).host;
}
