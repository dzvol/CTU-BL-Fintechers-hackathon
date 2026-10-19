import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useIntent, useTasks, useOperations } from '@/api/hooks';
import { approveIntent, rejectIntent } from '@/api/intents';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  Loading,
  ErrorState,
  KV,
  Money,
  fmtTime,
  Panel,
  Unsupported,
} from '@/components/sa/common';
import { StatusBadge } from '@/components/sa/status';
import { CloseTaskButton } from '@/components/sa/close-task-button';
import { PurchaseTable } from '@/components/sa/purchase-table';
export function TaskDetail() {
  const { id } = useParams({ strict: false }),
    intent = useIntent(id ?? ''),
    tasks = useTasks(),
    ops = useOperations(),
    qc = useQueryClient();
  const action = useMutation({
    mutationFn: async (decision: 'approve' | 'reject') => {
      if (!intent.data) throw new Error('Intent unavailable');
      return decision === 'approve' ? approveIntent(intent.data.id) : rejectIntent(intent.data.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries();
      toast.success('Intent decision recorded.');
    },
  });
  if (intent.isPending) return <Loading />;
  if (intent.error)
    return <ErrorState error={intent.error} onRetry={() => void intent.refetch()} />;
  if (!intent.data) return <Loading />;
  const i = intent.data,
    task = tasks.data?.find((t) => t.intentId === i.id);
  const pending = i.status === 'pending_approval',
    expired = Date.parse(i.expiresAt) <= Date.now();
  return (
    <>
      <Button asChild variant="ghost" className="mb-3 -ml-2">
        <Link to="/mandates">← Tasks</Link>
      </Button>
      <PageHeader
        title={pending ? 'Review proposed task' : 'Task details'}
        description={
          <>
            <StatusBadge value={task?.status ?? i.status} />
            <span className="mt-2 block">
              {task?.status === 'active'
                ? 'Your agent can request purchases within these approved limits.'
                : pending
                  ? 'No purchases are authorized until you approve.'
                  : 'No new purchases are authorized by these historical terms.'}
            </span>
          </>
        }
        actions={task?.status === 'active' ? <CloseTaskButton task={task} /> : undefined}
      />
      <div className="task-document">
        <section className="task-purpose">
          <h2>Purpose</h2>
          <p className="mb-4 text-lg">{i.purpose}</p>
          <h2>Original request</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{i.task}</p>
        </section>
        <section className="task-permissions">
          <div className="task-section">
            <h2>Allowed purchases</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {i.allowedPurchases.map((p, n) => (
                <li key={n}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="task-section">
            <h2>Never allowed</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {i.forbidden.map((p, n) => (
                <li key={n}>{p}</li>
              ))}
            </ul>
          </div>
        </section>
        <section className="task-terms">
          <h2>Task terms</h2>
          <dl className="divide-y">
            <KV label="Total budget">
              <Money value={i.budget} />
            </KV>
            <KV label="Per purchase">
              <Money value={i.maxPerPurchase} />
            </KV>
            <KV label="Planned purchases">{i.plannedPurchases}</KV>
            <KV label={task ? 'Task expires' : 'Proposal expires'}>
              {fmtTime(task?.expiresAt ?? i.expiresAt, true)}
            </KV>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Intent terms are immutable. Reject an incorrect proposal and ask your agent to submit
            another.
          </p>
        </section>
      </div>
      <Unsupported>
        Editing or amending intent terms, interpretation confidence, disclosure controls and content
        hashes are not provided by the gateway.
      </Unsupported>
      {tasks.error && <ErrorState error={tasks.error} />}
      <details className="my-4 border-b py-3">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Agent proposal & record
        </summary>
        <dl>
          <KV label="Intent ID" mono>
            {i.id}
          </KV>
          {task && (
            <KV label="Task ID" mono>
              {task.id}
            </KV>
          )}
          <KV label="Agent key ID" mono>
            {i.apiKeyId}
          </KV>
          <KV label="Submitted">{fmtTime(i.createdAt, true)}</KV>
          {i.decidedAt && <KV label="Decision recorded">{fmtTime(i.decidedAt, true)}</KV>}
        </dl>
      </details>
      {pending && (
        <footer className="task-footer">
          <p className="mb-3 text-sm">
            Approve only if the purpose, allowed purchases and limits match your request.
          </p>
          {expired && (
            <p role="status" className="mb-3">
              This proposal has expired. Ask your agent for a new one.
            </p>
          )}
          {action.error && <ErrorState error={action.error} />}
          <div className="mt-3 flex justify-end gap-3">
            <Button
              variant="outline"
              disabled={action.isPending || expired}
              onClick={() => action.mutate('reject')}
            >
              Reject intent
            </Button>
            <Button disabled={action.isPending || expired} onClick={() => action.mutate('approve')}>
              Approve task
            </Button>
          </div>
        </footer>
      )}
      {task && (
        <Panel title="Purchases under this task">
          {ops.isPending ? (
            <Loading />
          ) : ops.error ? (
            <ErrorState error={ops.error} />
          ) : (
            <PurchaseTable
              operations={(ops.data ?? []).filter((o) => o.taskId === task.id)}
              intents={[i]}
              tasks={[task]}
            />
          )}
        </Panel>
      )}
    </>
  );
}
