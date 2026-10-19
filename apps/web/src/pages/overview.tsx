import { Link } from '@tanstack/react-router';
import { useMe, useIntents, useTasks, useOperations, useKeys } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, KV, Money, ErrorState, Loading, fmtTime } from '@/components/sa/common';
import { CloseTaskButton } from '@/components/sa/close-task-button';
import { PurchaseTable } from '@/components/sa/purchase-table';
import { ReviewQueue } from '@/components/sa/review-queue';
export function Overview() {
  const me = useMe(),
    intents = useIntents(),
    tasks = useTasks(),
    ops = useOperations(),
    keys = useKeys();
  const active = tasks.data?.find((t) => t.status === 'active');
  const connected = keys.data?.some((k) => !k.revokedAt) ?? false;
  const pending = intents.data?.filter((i) => i.status === 'pending_approval') ?? [];
  return (
    <>
      <PageHeader
        title="Overview"
        description="Manage approved tasks and keep track of agent purchases."
      />
      {me.data && (
        <section className="mb-6 rounded-lg border bg-card p-5" aria-label="Allocation">
          <p className="text-xs text-muted-foreground">Assigned sponsored allocation</p>
          <Money value={me.data.allocation} className="mt-1 block text-2xl font-semibold" />
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Pre-funded allowance · Base Sepolia. Available, reserved and spent balances are not
            available yet.
          </p>
        </section>
      )}
      <Panel title={active ? 'Active task' : 'Next step'}>
        {tasks.isPending ? (
          <Loading />
        ) : tasks.error ? (
          <ErrorState error={tasks.error} />
        ) : active ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-medium">
                {intents.data?.find((i) => i.id === active.intentId)?.purpose ?? active.id}
              </p>
              <CloseTaskButton task={active} />
            </div>
            <dl>
              <KV label="Budget">
                <Money value={active.budget} />
              </KV>
              <KV label="Expires">{fmtTime(active.expiresAt, true)}</KV>
            </dl>
            <Button asChild variant="link" className="px-0">
              <Link to="/mandates/$id" params={{ id: active.intentId }}>
                View approved task →
              </Link>
            </Button>
          </>
        ) : keys.isPending ? (
          <Loading label="Checking your agent connection…" />
        ) : keys.error ? (
          <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
        ) : (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-prose">
              <p className="font-medium">
                {pending.length
                  ? 'Review your agent’s proposal'
                  : connected
                    ? 'Ready for your next task'
                    : 'Connect your first agent'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pending.length
                  ? 'Approve a proposed task to let your agent request purchases within its limits.'
                  : connected
                    ? 'Ask your connected agent to submit an intent. Its proposal will appear here for approval.'
                    : 'Create a key and connect Claude Code or Codex. You approve the task before any purchases.'}
              </p>
            </div>
            {pending.length ? (
              <Button asChild>
                <Link to="/mandates">Review tasks</Link>
              </Button>
            ) : (
              <Button asChild variant={connected ? 'outline' : 'default'}>
                <Link to="/connect">{connected ? 'Agent setup' : 'Connect agent'}</Link>
              </Button>
            )}
          </div>
        )}
      </Panel>
      <Panel title="Needs your decision">
        {intents.isPending ? (
          <Loading />
        ) : intents.error ? (
          <ErrorState error={intents.error} />
        ) : pending.length ? (
          <div className="space-y-3">
            {pending.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{i.purpose}</p>
                  <p className="text-sm text-warning">Intent awaiting approval</p>
                </div>
                <Button asChild variant="outline">
                  <Link to="/mandates/$id" params={{ id: i.id }}>
                    Review task
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No intents awaiting approval.</p>
        )}
        <ReviewQueue />
      </Panel>
      <Panel
        title="Recent purchase activity"
        actions={
          <Button asChild variant="link">
            <Link to="/activity">All activity</Link>
          </Button>
        }
      >
        {ops.isPending ? (
          <Loading />
        ) : ops.error ? (
          <ErrorState error={ops.error} />
        ) : ops.data?.length ? (
          <PurchaseTable
            operations={[...(ops.data ?? [])]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 6)}
            intents={intents.data}
            tasks={tasks.data}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No purchase activity yet.</p>
        )}
      </Panel>
    </>
  );
}
