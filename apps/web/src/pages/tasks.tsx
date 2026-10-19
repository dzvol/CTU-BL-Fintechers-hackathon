import { Link } from '@tanstack/react-router';
import { useIntents, useTasks } from '@/api/hooks';
import { PageHeader, Empty, ErrorState, Loading, Money, fmtTime } from '@/components/sa/common';
import { StatusBadge } from '@/components/sa/status';
import { Button } from '@/components/ui/button';
export function Tasks() {
  const intents = useIntents(),
    tasks = useTasks();
  if (intents.isPending || tasks.isPending) return <Loading />;
  if (intents.error)
    return <ErrorState error={intents.error} onRetry={() => void intents.refetch()} />;
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />;
  if (!intents.data || !tasks.data) return <Loading />;
  const taskItems = tasks.data;
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Your agent proposes an intent. Review its purpose and limits before approving a task."
      />
      {!intents.data.length ? (
        <Empty title="No intents yet">Connect an agent and ask it to submit an intent.</Empty>
      ) : (
        <div className="divide-y">
          {intents.data.map((i) => {
            const task = taskItems.find((t) => t.intentId === i.id);
            return (
              <article key={i.id} className="py-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="min-w-0 break-words font-semibold">{i.purpose}</h2>
                  <StatusBadge value={task?.status ?? i.status} />
                </div>
                <p className="mb-2 text-sm text-muted-foreground">
                  {fmtTime(i.createdAt, true)} · Budget <Money value={i.budget} />
                </p>
                <Button asChild variant="outline">
                  <Link to="/mandates/$id" params={{ id: i.id }}>
                    {i.status === 'pending_approval' ? 'Review task' : 'View task'}
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
