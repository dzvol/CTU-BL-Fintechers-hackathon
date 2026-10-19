import { Link } from '@tanstack/react-router';
import { CheckCircle2, Clock, Wallet } from 'lucide-react';
import { useIntents, useKeys, useOperations, usePending, useTasks } from '@/api/hooks';
import { ActivityList } from '@/components/sa/activity-list';
import { CloseTaskButton } from '@/components/sa/close-task-button';
import {
  Empty,
  ErrorState,
  Hint,
  Loading,
  Meter,
  Money,
  PageHeader,
  Section,
} from '@/components/sa/common';
import { IntentCard } from '@/components/sa/intent-card';
import { ReviewCard } from '@/components/sa/review-card';
import { Button } from '@/components/ui/button';
import { fromNow } from '@/lib/time';

export function Overview() {
  const pending = usePending(),
    intents = useIntents(),
    tasks = useTasks(),
    ops = useOperations(),
    keys = useKeys();
  const active = tasks.data?.find((t) => t.status === 'active');
  const activeIntent = intents.data?.find((i) => i.id === active?.intentId);
  const agentName = (keyId: string) => keys.data?.find((k) => k.id === keyId)?.name;
  const hasKey = keys.data?.some((k) => !k.revokedAt);
  const recent = [...(ops.data ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  // A new account has nothing to show yet: one clear first step instead of three empty sections.
  const fresh =
    keys.data?.length === 0 &&
    intents.data?.length === 0 &&
    ops.data?.length === 0 &&
    pending.count === 0;

  if (fresh)
    return (
      <>
        <PageHeader title="Overview" />
        <Empty title="Connect your agent to get started">
          <p>Create a key, add it to Claude Code or Codex, then approve the first task here.</p>
          <Button asChild size="sm" className="mt-4 h-9">
            <Link to="/agent">Connect agent</Link>
          </Button>
        </Empty>
      </>
    );

  return (
    <>
      <PageHeader title="Overview" />

      <Section title="Waiting for you" count={pending.count}>
        {pending.isPending ? (
          <Loading />
        ) : pending.error ? (
          <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />
        ) : pending.count ? (
          <div className="space-y-3">
            {pending.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
            {pending.intents.map((i) => (
              <IntentCard key={i.id} intent={i} agent={agentName(i.apiKeyId)} />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            Nothing to approve.
          </p>
        )}
      </Section>

      <Section title="Active task">
        {tasks.isPending || keys.isPending ? (
          <Loading />
        ) : tasks.error ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : active ? (
          <article className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Link
                to="/tasks/$id"
                params={{ id: active.intentId }}
                className="min-w-0 flex-1 font-medium hover:underline"
              >
                {activeIntent?.purpose ?? 'Approved task'}
              </Link>
              <CloseTaskButton task={active} />
            </div>
            <Meter
              className="mt-4"
              total={active.budget}
              spent={active.spent}
              reserved={active.reserved}
            />
            <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Hint label="Spent of budget">
                  <Wallet className="size-3.5" aria-hidden />
                </Hint>
                <Money value={active.spent} unit={false} className="text-foreground" /> /{' '}
                <Money value={active.budget} />
              </span>
              <span className="flex items-center gap-1.5">
                <Hint label="Task ends">
                  <Clock className="size-3.5" aria-hidden />
                </Hint>
                {fromNow(active.expiresAt)}
              </span>
            </p>
          </article>
        ) : hasKey ? (
          <Empty title="No active task">Ask your agent to propose one. It shows up here.</Empty>
        ) : (
          <Empty title="Connect your agent to get started">
            <Button asChild size="sm" className="mt-2 h-9">
              <Link to="/agent">Connect agent</Link>
            </Button>
          </Empty>
        )}
      </Section>

      <Section
        title="Recent activity"
        actions={
          recent.length ? (
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/activity">View all</Link>
            </Button>
          ) : undefined
        }
      >
        {ops.isPending ? (
          <Loading />
        ) : ops.error ? (
          <ErrorState error={ops.error} onRetry={() => void ops.refetch()} />
        ) : recent.length ? (
          <ActivityList operations={recent} />
        ) : (
          <p className="text-sm text-muted-foreground">No purchases yet.</p>
        )}
      </Section>
    </>
  );
}
