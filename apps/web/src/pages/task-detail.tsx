import type { ReactNode } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Check, Clock, Hourglass, X } from 'lucide-react';
import { toast } from 'sonner';
import { useIntent, useKeys, useOperations, useTasks } from '@/api/hooks';
import { approveIntent, rejectIntent } from '@/api/intents';
import { ActivityList } from '@/components/sa/activity-list';
import { CloseTaskButton } from '@/components/sa/close-task-button';
import {
  Badge,
  ErrorState,
  Hint,
  Loading,
  Meter,
  Money,
  PageHeader,
  Section,
} from '@/components/sa/common';
import { Button } from '@/components/ui/button';
import { taskStatus } from '@/lib/labels';
import { countdown, fromNow, fullTime, useNow } from '@/lib/time';

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

export function TaskDetail() {
  const { id } = useParams({ strict: false }),
    intent = useIntent(id ?? ''),
    tasks = useTasks(),
    ops = useOperations(),
    keys = useKeys(),
    qc = useQueryClient(),
    now = useNow();
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      decision === 'approve' ? approveIntent(intent.data!.id) : rejectIntent(intent.data!.id),
    onSuccess: (_, decision) => {
      void qc.invalidateQueries();
      toast.success(
        decision === 'approve' ? 'Task approved. Your agent can start.' : 'Task rejected.',
      );
    },
  });
  if (intent.isPending) return <Loading />;
  if (intent.error)
    return <ErrorState error={intent.error} onRetry={() => void intent.refetch()} />;
  if (!intent.data) return <Loading />;

  const i = intent.data;
  const task = tasks.data?.find((t) => t.intentId === i.id);
  const status = taskStatus(i.status, task?.status);
  const pending = i.status === 'pending_approval';
  const left = countdown(i.expiresAt, now);
  const agent = keys.data?.find((k) => k.id === i.apiKeyId)?.name;
  const purchases = (ops.data ?? [])
    .filter((o) => task && o.taskId === task.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className={pending ? 'pb-24' : undefined}>
      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4 h-8 text-muted-foreground">
        <Link to="/tasks">
          <ArrowLeft aria-hidden />
          Tasks
        </Link>
      </Button>
      <PageHeader
        title={i.purpose}
        actions={
          task?.status === 'active' ? <CloseTaskButton task={task} size="default" /> : undefined
        }
      >
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Badge tone={status.tone} icon={status.icon}>
            {status.text}
          </Badge>
          {agent && (
            <span className="flex items-center gap-1.5">
              <Hint label="Proposed by">
                <Bot className="size-4" aria-hidden />
              </Hint>
              {agent}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Hint label="Proposed">
              <Clock className="size-4" aria-hidden />
            </Hint>
            <time dateTime={i.createdAt} title={fullTime(i.createdAt)}>
              {fromNow(i.createdAt, now)}
            </time>
          </span>
        </span>
      </PageHeader>

      {task && (
        <Section title="Budget">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <Money value={task.spent} unit={false} className="text-xl font-semibold" />
                <span className="text-sm text-muted-foreground"> of </span>
                <Money value={task.budget} className="text-sm text-muted-foreground" />
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Hint
                  label={
                    task.status === 'active' ? 'Task ends' : task.closedAt ? 'Stopped' : 'Ended'
                  }
                >
                  <Clock className="size-4" aria-hidden />
                </Hint>
                {fromNow(task.closedAt ?? task.expiresAt, now)}
              </span>
            </p>
            <Meter
              className="mt-3"
              total={task.budget}
              spent={task.spent}
              reserved={task.reserved}
            />
            {BigInt(task.reserved) > 0n && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Hint label="On hold for payments in progress">
                  <Hourglass className="size-3.5 text-warning" aria-hidden />
                </Hint>
                <Money value={task.reserved} />
              </p>
            )}
          </div>
        </Section>
      )}

      <Section title="Request">
        <blockquote className="whitespace-pre-wrap border-l-2 pl-4 text-[15px] leading-relaxed">
          {i.task}
        </blockquote>
      </Section>

      <Section title="Rules">
        <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
          <div className="bg-card p-4 sm:p-5">
            <h3 className="mb-2 text-xs text-muted-foreground">Can buy</h3>
            <ul className="space-y-1.5 text-sm">
              {i.allowedPurchases.map((p, n) => (
                <li key={n} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card p-4 sm:p-5">
            <h3 className="mb-2 text-xs text-muted-foreground">Never buys</h3>
            <ul className="space-y-1.5 text-sm">
              {i.forbidden.map((p, n) => (
                <li key={n} className="flex gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-3 divide-x overflow-hidden rounded-xl border bg-card">
          <Term label="Total budget">
            <Money value={i.budget} />
          </Term>
          <Term label="Max per purchase">
            <Money value={i.maxPerPurchase} />
          </Term>
          <Term label="Purchases planned">{i.plannedPurchases}</Term>
        </dl>
      </Section>

      {task && (
        <Section title="Purchases">
          {ops.error ? (
            <ErrorState error={ops.error} onRetry={() => void ops.refetch()} />
          ) : purchases.length ? (
            <ActivityList operations={purchases} />
          ) : (
            <p className="text-sm text-muted-foreground">No purchases yet.</p>
          )}
        </Section>
      )}

      {pending && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur md:left-60">
          <div className="mx-auto flex max-w-[880px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
            <p className="text-sm text-muted-foreground tabular-nums">
              {left ? `Expires in ${left}` : 'This proposal expired. Ask your agent for a new one.'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={decide.isPending || !left}
                onClick={() => decide.mutate('reject')}
              >
                Reject
              </Button>
              <Button disabled={decide.isPending || !left} onClick={() => decide.mutate('approve')}>
                Approve task
              </Button>
            </div>
            {decide.error && (
              <div className="w-full">
                <ErrorState error={decide.error} />
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
