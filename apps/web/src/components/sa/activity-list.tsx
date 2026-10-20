import { Link } from '@tanstack/react-router';
import type { Operation } from '@semanticauth/contracts';
import { ExternalLink } from 'lucide-react';
import { host, outcome, path } from '@/lib/labels';
import { fromNow, fullTime } from '@/lib/time';
import { Hint, Money, StatusIcon } from './common';

/** Paid fetches, newest first. `purposeOf` names the task each one ran under. */
export function ActivityList({
  operations,
  purposeOf,
}: {
  operations: Operation[];
  purposeOf?: (taskId: string) => string | undefined;
}) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {operations.map((op) => {
        const purpose = purposeOf?.(op.taskId);
        return (
          <li
            key={op.id}
            className="relative flex items-center gap-3.5 px-4 py-3 first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 sm:px-5"
          >
            <StatusIcon status={outcome(op)} />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-baseline gap-2">
                <Link
                  to="/activity/$id"
                  params={{ id: op.id }}
                  className="truncate font-medium after:absolute after:inset-0 focus-visible:outline-none"
                >
                  {host(op.url)}
                </Link>
                <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
                  {path(op.url)}
                </span>
              </p>
              <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={op.createdAt} title={fullTime(op.createdAt)} className="shrink-0">
                  {fromNow(op.createdAt)}
                </time>
                {purpose && <span className="truncate">{purpose}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {op.offer && <Money value={op.offer.amount} className="text-sm font-medium" />}
              {op.settlement && (
                <a
                  href={op.settlement.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="relative z-10 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Hint label="View on Basescan">
                    <ExternalLink className="size-3.5" aria-hidden />
                  </Hint>
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
