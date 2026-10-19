import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useIntents, useOperations } from '@/api/hooks';
import { ActivityList } from '@/components/sa/activity-list';
import { Empty, ErrorState, Loading, PageHeader } from '@/components/sa/common';
import { Input } from '@/components/ui/input';
import { FILTERS } from '@/lib/filters';
import { cn } from '@/lib/utils';

export function Activity() {
  const search = useSearch({ strict: false }),
    ops = useOperations(),
    intents = useIntents();
  const [text, setText] = useState('');
  const filter = FILTERS.find((f) => f.id === search.filter) ?? FILTERS[0];
  const purposeOf = (taskId: string) => intents.data?.find((i) => i.taskId === taskId)?.purpose;
  const all = [...(ops.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const needle = text.trim().toLowerCase();
  const rows = all
    .filter(filter.test)
    .filter(
      (o) => !needle || `${o.url} ${purposeOf(o.taskId) ?? ''}`.toLowerCase().includes(needle),
    );

  return (
    <>
      <PageHeader title="Activity">
        Every purchase your agent tried, and what the gateway did.
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter activity" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const count = all.filter(f.test).length;
            return (
              <Link
                key={f.id}
                to="/activity"
                search={{ filter: f.id }}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  f.id === filter.id &&
                    'bg-foreground text-background hover:bg-foreground hover:text-background',
                )}
                aria-current={f.id === filter.id ? 'page' : undefined}
              >
                {f.label}
                {f.id !== 'all' && count > 0 && (
                  <span className="text-xs tabular-nums opacity-70">{count}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search activity</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Merchant or task"
            className="h-9 pl-9"
          />
        </label>
      </div>
      {ops.isPending ? (
        <Loading />
      ) : ops.error ? (
        <ErrorState error={ops.error} onRetry={() => void ops.refetch()} />
      ) : rows.length ? (
        <ActivityList operations={rows} purposeOf={purposeOf} />
      ) : (
        <Empty title={all.length ? 'Nothing matches' : 'No purchases yet'}>
          {!all.length && 'Purchases appear here once your agent starts buying.'}
        </Empty>
      )}
    </>
  );
}
