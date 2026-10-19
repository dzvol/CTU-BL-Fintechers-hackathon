import { useState } from 'react';
import { Link, useSearch, useNavigate } from '@tanstack/react-router';
import type { Operation } from '@semanticauth/contracts';
import { useOperations, useIntents, useTasks } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, Empty, ErrorState, Loading } from '@/components/sa/common';
import { PurchaseTable } from '@/components/sa/purchase-table';
import { Input } from '@/components/ui/input';
import { FilterField } from '@/components/sa/filter-field';
import { paymentLabel, deliveryLabel } from '@/lib/operation-display';
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
  const navigate = useNavigate();
  const search = useSearch({ strict: false }),
    ops = useOperations(),
    intents = useIntents(),
    tasks = useTasks();
  const [searchText, setSearchText] = useState(''),
    [decision, setDecision] = useState('all'),
    [payment, setPayment] = useState('all'),
    [delivery, setDelivery] = useState('all'),
    [taskId, setTaskId] = useState('all'),
    [from, setFrom] = useState(''),
    [until, setUntil] = useState('');
  const filter = FILTERS.find((f) => f.id === search.filter) ?? FILTERS[0];
  const rows =
    ops.data
      ?.filter(filter.test)
      .filter((o) => {
        const purpose =
          intents.data?.find((i) => i.id === tasks.data?.find((t) => t.id === o.taskId)?.intentId)
            ?.purpose ?? '';
        return (
          `${o.url} ${purpose}`.toLowerCase().includes(searchText.toLowerCase()) &&
          (decision === 'all' || o.verdict === decision) &&
          (payment === 'all' || paymentLabel(o) === payment) &&
          (delivery === 'all' || deliveryLabel(o) === delivery) &&
          (taskId === 'all' || o.taskId === taskId) &&
          (!from || o.createdAt.slice(0, 10) >= from) &&
          (!until || o.createdAt.slice(0, 10) <= until)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [];
  return (
    <>
      <PageHeader
        title="Activity"
        description="Inspect requests, spending decisions, and delivery outcomes."
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Search activity
          <Input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Service, endpoint, or task"
          />
        </label>
        <FilterField
          label="View"
          value={filter.id}
          onChange={(value) =>
            void navigate({
              to: '/activity',
              search: { filter: FILTERS.find((f) => f.id === value)?.id ?? 'all' },
            })
          }
        >
          {FILTERS.map((f) => (
            <option value={f.id} key={f.id}>
              {f.label}
            </option>
          ))}
        </FilterField>
        <FilterField label="Decision" value={decision} onChange={setDecision}>
          <option value="all">All decisions</option>
          <option value="ALLOW">Allowed</option>
          <option value="BLOCK">Blocked</option>
          <option value="REVIEW">Needs approval</option>
        </FilterField>
      </div>
      <details className="mb-4 border-b pb-3">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          More filters
          {[payment !== 'all', delivery !== 'all', taskId !== 'all', !!from, !!until].filter(
            Boolean,
          ).length
            ? ` · ${[payment !== 'all', delivery !== 'all', taskId !== 'all', !!from, !!until].filter(Boolean).length} active`
            : ''}
        </summary>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterField label="Payment" value={payment} onChange={setPayment}>
            <option value="all">All payments</option>
            {[...new Set(ops.data?.map(paymentLabel))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </FilterField>
          <FilterField label="Delivery" value={delivery} onChange={setDelivery}>
            <option value="all">All outcomes</option>
            {[...new Set(ops.data?.map(deliveryLabel))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </FilterField>
          <FilterField label="Task" value={taskId} onChange={setTaskId}>
            <option value="all">All tasks</option>
            {[...new Set(ops.data?.map((o) => o.taskId))].map((id) => (
              <option key={id} value={id}>
                {intents.data?.find((i) => i.id === tasks.data?.find((t) => t.id === id)?.intentId)
                  ?.purpose ?? id}
              </option>
            ))}
          </FilterField>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            From date
            <Input
              type="date"
              value={from}
              max={until || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            To date
            <Input
              type="date"
              value={until}
              min={from || undefined}
              onChange={(e) => setUntil(e.target.value)}
            />
          </label>
        </div>
      </details>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted-foreground" role="status">
          {ops.isPending
            ? 'Loading activity…'
            : `${rows.length} matching ${rows.length === 1 ? 'request' : 'requests'}`}
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          onClick={() => {
            setSearchText('');
            setDecision('all');
            setPayment('all');
            setDelivery('all');
            setTaskId('all');
            setFrom('');
            setUntil('');
          }}
        >
          <Link to="/activity" search={{ filter: 'all' }}>
            Clear filters
          </Link>
        </Button>
      </div>
      <Panel>
        {ops.isPending ? (
          <Loading />
        ) : ops.error ? (
          <ErrorState error={ops.error} onRetry={() => void ops.refetch()} />
        ) : rows.length ? (
          <PurchaseTable operations={rows} intents={intents.data} tasks={tasks.data} />
        ) : (
          <Empty title={'No activity matches your filters'} />
        )}
      </Panel>
      {filter.id === 'needs_review' && <ReviewQueue />}
    </>
  );
}
