import { Link } from '@tanstack/react-router';
import type { Intent } from '@semanticauth/contracts';
import { Bot, Tag, Timer, Wallet } from 'lucide-react';
import { countdown, useNow } from '@/lib/time';
import { Button } from '../ui/button';
import { Hint, Money } from './common';

/** A task an agent proposed; the user opens it to read the full terms before approving. */
export function IntentCard({ intent, agent }: { intent: Intent; agent?: string }) {
  const left = countdown(intent.expiresAt, useNow());
  return (
    <article className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{intent.purpose}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {agent && (
            <span className="flex items-center gap-1.5">
              <Hint label="Proposed by">
                <Bot className="size-3.5" aria-hidden />
              </Hint>
              {agent}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Hint label="Total budget">
              <Wallet className="size-3.5" aria-hidden />
            </Hint>
            <Money value={intent.budget} className="text-foreground" />
          </span>
          <span className="flex items-center gap-1.5">
            <Hint label="Max per purchase">
              <Tag className="size-3.5" aria-hidden />
            </Hint>
            <Money value={intent.maxPerPurchase} className="text-foreground" />
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <Hint label="Time left to decide">
              <Timer className="size-3.5" aria-hidden />
            </Hint>
            {left ?? 'Expired'}
          </span>
        </p>
      </div>
      <Button asChild size="sm" className="h-9">
        <Link to="/tasks/$id" params={{ id: intent.id }}>
          Review task
        </Link>
      </Button>
    </article>
  );
}
