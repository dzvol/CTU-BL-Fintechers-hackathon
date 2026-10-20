import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Review } from '@semanticauth/contracts';
import { Send, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { approveReview, rejectReview } from '@/api/reviews';
import { REASON, REASON_ICON, host, path, shortHex } from '@/lib/labels';
import { countdown, useNow } from '@/lib/time';
import { Button } from '../ui/button';
import { Badge, CopyButton, ErrorState, Hint, Money } from './common';

/**
 * One purchase the gateway paused for the user. The decision is sent for this review ID; the
 * gateway checks that it is still pending and the user's own.
 */
export function ReviewCard({ review, showLink = true }: { review: Review; showLink?: boolean }) {
  const qc = useQueryClient();
  const now = useNow();
  const left = countdown(review.expiresAt, now);
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      decision === 'approve' ? approveReview(review.id) : rejectReview(review.id),
    onSuccess: (_, decision) => {
      void qc.invalidateQueries();
      toast.success(
        decision === 'approve'
          ? 'Approved. Your agent pays on its next try.'
          : 'Rejected. Nothing was paid.',
      );
    },
  });
  const url = review.url ?? review.offer.resourceUrl;
  const disabled = decide.isPending || !left;
  return (
    <article className="rounded-xl border bg-card p-4 shadow-[0_1px_0_var(--border)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          {showLink ? (
            <Link
              to="/activity/$id"
              params={{ id: review.operationId }}
              className="font-medium hover:underline"
            >
              {host(url)}
            </Link>
          ) : (
            <p className="font-medium">{host(url)}</p>
          )}
          {path(url) && (
            <p className="truncate font-mono text-xs text-muted-foreground" title={url}>
              {path(url)}
            </p>
          )}
        </div>
        <Money value={review.offer.amount} className="text-lg font-semibold" />
      </div>
      {showLink && review.offer.description && (
        <p
          className="mt-2 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]"
          title="Written by the merchant, not verified"
        >
          {review.offer.serviceName && (
            <span className="font-medium text-foreground">{review.offer.serviceName}: </span>
          )}
          {review.offer.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Badge tone="warning" icon={REASON_ICON[review.reason]}>
          {REASON[review.reason]}
        </Badge>
        {review.detail && <span className="text-muted-foreground">{review.detail}</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex min-w-0 items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Hint label="Recipient">
              <Send className="size-3.5" aria-hidden />
            </Hint>
            <span className="font-mono text-foreground" title={review.offer.payTo}>
              {shortHex(review.offer.payTo)}
            </span>
            <CopyButton value={review.offer.payTo} label="Copy recipient" className="size-6" />
          </span>
          <span className="flex items-center gap-1.5 tabular-nums" role="timer">
            <Hint label="Time left to decide">
              <Timer className="size-3.5" aria-hidden />
            </Hint>
            {left ?? 'Expired'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={disabled}
            onClick={() => decide.mutate('reject')}
          >
            Reject
          </Button>
          <Button
            size="sm"
            className="h-9"
            disabled={disabled}
            onClick={() => decide.mutate('approve')}
          >
            Approve payment
          </Button>
        </div>
      </div>
      {decide.error && (
        <div className="mt-3">
          <ErrorState error={decide.error} />
        </div>
      )}
    </article>
  );
}
