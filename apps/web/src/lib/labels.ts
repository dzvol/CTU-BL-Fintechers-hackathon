import type {
  IntentStatus,
  Operation,
  PaymentNetwork,
  TaskStatus,
  VerdictReason,
} from '@semanticauth/contracts';
import {
  ArrowLeftRight,
  Ban,
  Bug,
  Check,
  CircleCheck,
  CircleHelp,
  CircleSlash2,
  Clock,
  CloudOff,
  Gauge,
  Gift,
  Hand,
  Hourglass,
  Layers,
  Minus,
  PackageCheck,
  PackageX,
  Repeat,
  Send,
  ServerCrash,
  ShieldAlert,
  Syringe,
  Target,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';

/** Colour family of a status; one meaning per tone across the whole dashboard. */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

/** A status as an icon; `text` is its tooltip and accessible name. */
export interface Label {
  text: string;
  tone: Tone;
  icon: LucideIcon;
}

/** Short, user-facing names and icons for the gateway's machine-readable reason codes. */
/** Where an offer is paid; mainnet is real money, so it is spelled out. */
export const NETWORK: Record<PaymentNetwork, string> = {
  'base-sepolia': 'USDC on Base Sepolia (testnet)',
  'base-mainnet': 'USDC on Base (mainnet)',
};

export const REASON: Record<VerdictReason, string> = {
  unsupported_offer: 'Unsupported payment',
  policy_limit_exceeded: 'Over the task limit',
  insufficient_allocation: 'Allowance used up',
  jev_unavailable: 'Check unavailable',
  prompt_injection: 'Manipulative offer',
  off_intent: 'Outside the task',
  merchant_error: 'Merchant error',
  internal_error: 'Gateway error',
  recipient_change: 'Recipient changed',
  subscription: 'Subscription',
  suspicious_offer: 'Suspicious offer',
  unclear_fit: 'Unclear fit',
  beyond_need: 'More than needed',
  within_intent: 'Within the task',
  free_content: 'Free',
};
export const REASON_ICON: Record<VerdictReason, LucideIcon> = {
  unsupported_offer: CircleSlash2,
  policy_limit_exceeded: Gauge,
  insufficient_allocation: Wallet,
  jev_unavailable: CloudOff,
  prompt_injection: Syringe,
  off_intent: Target,
  merchant_error: ServerCrash,
  internal_error: Bug,
  recipient_change: ArrowLeftRight,
  subscription: Repeat,
  suspicious_offer: ShieldAlert,
  unclear_fit: CircleHelp,
  beyond_need: Layers,
  within_intent: CircleCheck,
  free_content: Gift,
};

/**
 * Where an operation ended up, from the user's point of view. Delivery never proves payment;
 * only a settlement does. Issued or unconfirmed payments count as spent.
 */
export function outcome(op: Operation): Label {
  switch (op.state) {
    case 'requested':
      return { text: 'Checking', tone: 'muted', icon: Clock };
    case 'blocked':
      return { text: 'Blocked', tone: 'danger', icon: Ban };
    case 'awaiting_review':
      return { text: 'Needs you', tone: 'warning', icon: Hand };
    case 'reserved':
    case 'prepared':
    case 'issued':
    case 'submitted':
      return { text: 'Paying', tone: 'info', icon: Send };
    case 'unknown':
      return { text: 'Unconfirmed', tone: 'warning', icon: Hourglass };
    case 'settled':
      return { text: 'Paid', tone: 'success', icon: Check };
    case 'delivered':
      if (op.settlement) return { text: 'Paid', tone: 'success', icon: Check };
      if (op.reason === 'free_content') return { text: 'Free', tone: 'success', icon: Gift };
      return { text: 'Delivered', tone: 'success', icon: PackageCheck };
    case 'delivery_failed':
      return op.settlement
        ? { text: 'Paid, not delivered', tone: 'danger', icon: PackageX }
        : { text: 'Failed', tone: 'danger', icon: TriangleAlert };
    case 'closed':
      return { text: 'Not paid', tone: 'muted', icon: Minus };
  }
}

/** One status for the intent and the task created from it. */
export function taskStatus(intent: IntentStatus, task?: TaskStatus): Label {
  if (task === 'active') return { text: 'Active', tone: 'success', icon: Check };
  if (task === 'closed') return { text: 'Stopped', tone: 'muted', icon: Minus };
  if (task === 'expired') return { text: 'Ended', tone: 'muted', icon: Minus };
  switch (intent) {
    case 'pending_approval':
      return { text: 'Needs you', tone: 'warning', icon: Hand };
    case 'approved':
      return { text: 'Approved', tone: 'success', icon: Check };
    case 'rejected':
      return { text: 'Rejected', tone: 'muted', icon: X };
    case 'expired':
      return { text: 'Expired', tone: 'muted', icon: Hourglass };
  }
}

export const host = (url: string) => new URL(url).host;

/** Path and query without the origin; "/" is shown as nothing. */
export function path(url: string) {
  const { pathname, search } = new URL(url);
  return pathname === '/' && !search ? '' : `${pathname}${search}`;
}

/** 0x1234…cdef */
export const shortHex = (value: string, keep = 4) =>
  value.length <= keep * 2 + 4 ? value : `${value.slice(0, keep + 2)}…${value.slice(-keep)}`;
