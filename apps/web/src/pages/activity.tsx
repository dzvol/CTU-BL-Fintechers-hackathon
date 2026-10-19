import { Link, useSearch } from '@tanstack/react-router';
import type { Operation } from '@semanticauth/contracts';
import { useOperations, useIntents, useTasks } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, Empty, ErrorState, Loading } from '@/components/sa/common';
import { PurchaseTable } from '@/components/sa/purchase-table';
import { ReviewQueue } from '@/components/sa/review-queue';
export const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  {
    id: 'needs_review',
    label: 'Needs review',
    test: (o: Operation) => o.state === 'awaiting_review',
  },
  { id: 'blocked', label: 'Blocked', test: (o: Operation) => o.state === 'blocked' },
  {
    id: 'pending_payment',
    label: 'Pending payment',
    test: (o: Operation) =>
      ['reserved', 'prepared', 'issued', 'submitted', 'unknown'].includes(o.state),
  },
  { id: 'paid', label: 'Paid', test: (o: Operation) => !!o.settlement },
  {
    id: 'delivery_problems',
    label: 'Delivery problems',
    test: (o: Operation) => o.state === 'delivery_failed',
  },
] as const;
export type ActivityFilter = (typeof FILTERS)[number]['id'];
export function Activity() {
  const search = useSearch({ strict: false }),
    ops = useOperations(),
    intents = useIntents(),
    tasks = useTasks();
  const filter = FILTERS.find((f) => f.id === search.filter) ?? FILTERS[0];
  const rows =
    ops.data?.filter(filter.test).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [];
  return (
    <>
      <PageHeader
        title="Activity"
        description="Payment and delivery are tracked separately. An unknown payment outcome counts as spent until the gateway proves otherwise."
      />
      <nav aria-label="Filter purchases" className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            asChild
            variant="ghost"
            key={f.id}
            className={`rounded-md border px-2.5 text-sm ${f.id === filter.id ? 'border-primary bg-accent font-medium text-accent-foreground' : 'bg-card hover:bg-muted'}`}
          >
            <Link
              to="/activity"
              search={{ filter: f.id }}
              aria-current={f.id === filter.id ? 'page' : undefined}
            >
              {f.label}
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                {ops.data?.filter(f.test).length ?? '—'}
              </span>
            </Link>
          </Button>
        ))}
      </nav>
      <Panel>
        {ops.isPending ? (
          <Loading />
        ) : ops.error ? (
          <ErrorState error={ops.error} onRetry={() => void ops.refetch()} />
        ) : rows.length ? (
          <PurchaseTable operations={rows} intents={intents.data} tasks={tasks.data} />
        ) : (
          <Empty
            title={
              filter.id === 'all' ? 'No purchases yet' : `No purchases match “${filter.label}”`
            }
          />
        )}
      </Panel>
      {filter.id === 'needs_review' && <ReviewQueue />}
    </>
  );
}
