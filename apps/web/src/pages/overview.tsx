import { Link } from '@tanstack/react-router';
import { useMe, useIntents, useTasks, useOperations } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  Panel,
  KV,
  Money,
  ErrorState,
  Loading,
  Unsupported,
  fmtTime,
} from '@/components/sa/common';
import { CloseTaskButton } from '@/components/sa/close-task-button';
import { PurchaseTable } from '@/components/sa/purchase-table';
import { ReviewQueue } from '@/components/sa/review-queue';
export function Overview() {
  const me = useMe(),
    intents = useIntents(),
    tasks = useTasks(),
    ops = useOperations();
  const active = tasks.data?.find((t) => t.status === 'active');
  const pending = intents.data?.filter((i) => i.status === 'pending_approval') ?? [];
  return (
    <>
      <PageHeader title="Overview" description={me.data?.email} />
      {me.data && (
        <section className="mb-6 rounded-lg border bg-card p-5" aria-label="Allocation">
          <p className="text-xs text-muted-foreground">Assigned sponsored allocation</p>
          <Money value={me.data.allocation} className="mt-1 block text-2xl font-semibold" />
          <p className="mt-2 text-xs text-muted-foreground">
            Shared sponsor-funded wallet · Base Sepolia. This is an allocation, not an available
            balance.
          </p>
        </section>
      )}
      <Unsupported>
        Available, reserved and spent allocation totals are not exposed. Task spent/reserved fields
        are currently backend placeholders.
      </Unsupported>
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
      <Panel title="Active task">
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
        ) : (
          <p className="text-sm text-muted-foreground">
            No active task. Connect an agent and ask it to submit an intent.
          </p>
        )}
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
