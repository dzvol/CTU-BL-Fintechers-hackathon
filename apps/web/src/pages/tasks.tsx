import { Link } from '@tanstack/react-router';
import { Bot, ChevronRight } from 'lucide-react';
import { useIntents, useKeys, useTasks } from '@/api/hooks';
import {
  Empty,
  ErrorState,
  Hint,
  Loading,
  Money,
  PageHeader,
  StatusIcon,
} from '@/components/sa/common';
import { taskStatus } from '@/lib/labels';
import { fromNow, fullTime } from '@/lib/time';

export function Tasks() {
  const intents = useIntents(),
    tasks = useTasks(),
    keys = useKeys();
  if (intents.isPending || tasks.isPending) return <Loading />;
  const error = intents.error ?? tasks.error;
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => void Promise.all([intents.refetch(), tasks.refetch()])}
      />
    );
  const rows = [...(intents.data ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((intent) => ({ intent, task: tasks.data?.find((t) => t.intentId === intent.id) }));

  return (
    <>
      <PageHeader title="Tasks">What your agent asked to buy, and what you allowed.</PageHeader>
      {rows.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map(({ intent, task }) => {
            const status = taskStatus(intent.status, task?.status);
            const agent = keys.data?.find((k) => k.id === intent.apiKeyId)?.name;
            return (
              <li
                key={intent.id}
                className="relative flex items-center gap-3.5 px-4 py-3.5 first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 sm:px-5"
              >
                <StatusIcon status={status} />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/tasks/$id"
                    params={{ id: intent.id }}
                    className="line-clamp-2 font-medium after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {intent.purpose}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <time dateTime={intent.createdAt} title={fullTime(intent.createdAt)}>
                      {fromNow(intent.createdAt)}
                    </time>
                    {agent && (
                      <span className="flex min-w-0 items-center gap-1">
                        <Hint label="Agent">
                          <Bot className="size-3.5" aria-hidden />
                        </Hint>
                        <span className="truncate">{agent}</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-sm">
                  <span className="tabular-nums">
                    {task ? (
                      <>
                        <Money value={task.spent} unit={false} />
                        <span className="text-muted-foreground"> / </span>
                      </>
                    ) : null}
                    <Money value={intent.budget} />
                  </span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No tasks yet">Ask your agent to propose one, then approve it here.</Empty>
      )}
    </>
  );
}
