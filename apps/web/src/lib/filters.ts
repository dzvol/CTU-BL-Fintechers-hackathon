import type { Operation } from '@semanticauth/contracts';

/** Activity views; the id is kept in the URL (?filter=). */
export const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'paid', label: 'Paid', test: (o: Operation) => !!o.settlement },
  { id: 'review', label: 'Needs you', test: (o: Operation) => o.state === 'awaiting_review' },
  { id: 'blocked', label: 'Blocked', test: (o: Operation) => o.state === 'blocked' },
  {
    id: 'problems',
    label: 'Problems',
    test: (o: Operation) => o.state === 'unknown' || o.state === 'delivery_failed',
  },
] as const;
export type ActivityFilter = (typeof FILTERS)[number]['id'];
