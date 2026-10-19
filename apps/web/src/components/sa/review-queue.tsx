import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Review } from '@semanticauth/contracts';
import { toast } from 'sonner';
import { useExpiredAt } from '@/hooks/use-expired-at';
import { useReviews } from '@/api/hooks';
import { approveReview, rejectReview } from '@/api/reviews';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ErrorState, KV, Loading, Money, fmtTime } from './common';
export function ReviewQueue() {
  const q = useReviews();
  return (
    <section aria-label="Purchase reviews" className="mt-5">
      {q.isPending ? (
        <Loading label="Checking purchase reviews…" />
      ) : q.error ? (
        <ErrorState
          error={q.error}
          onRetry={() => void q.refetch()}
          unavailableTitle="Purchase reviews are unavailable"
        />
      ) : (
        (q.data ?? [])
          .filter((r) => r.status === 'pending')
          .map((r) => (
            <div
              key={r.id}
              className="mt-3 flex items-center justify-between gap-3 rounded border p-3"
            >
              <p className="min-w-0 break-all text-sm">
                {new URL(r.offer.resourceUrl).host} · <Money value={r.offer.amount} />
              </p>
              <PurchaseReviewDialog review={r} />
            </div>
          ))
      )}
    </section>
  );
}
export function PurchaseReviewDialog({ review }: { review: Review }) {
  const [open, setOpen] = useState(false),
    qc = useQueryClient();
  const [seen, setSeen] = useState(review);
  const changed = JSON.stringify(seen) !== JSON.stringify(review);
  const expired = useExpiredAt(seen.expiresAt, open);
  const action = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => {
      if (changed || Date.parse(seen.expiresAt) <= Date.now() || review.status !== 'pending') {
        throw new Error('This review changed or expired. Load the latest offer before deciding.');
      }
      return decision === 'approve' ? approveReview(seen.id) : rejectReview(seen.id);
    },
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries();
      toast.success('Review decision recorded.');
    },
  });
  const disabled = action.isPending || review.status !== 'pending' || expired || changed;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSeen(structuredClone(review));
        action.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Review purchase</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Why this purchase needs review</DialogTitle>
          <DialogDescription>
            Review the exact gateway offer. Your decision applies to this review ID; the gateway
            enforces authorization.
          </DialogDescription>
        </DialogHeader>
        <section className="border-l-4 border-warning bg-warning-soft p-3 text-sm">
          <h2 className="font-semibold">Backend decision reason</h2>
          <p>{seen.reason}</p>
        </section>
        <dl>
          <KV label="Operation" mono>
            {seen.operationId}
          </KV>
          <KV label="Resource" stackOnMobile mono>
            {seen.offer.resourceUrl}
          </KV>
          <KV label="Recipient" mono>
            {seen.offer.payTo}
          </KV>
          <KV label="Quoted amount">
            <Money value={seen.offer.amount} />
          </KV>
          <KV label="Network">{seen.offer.network}</KV>
          <KV label="Expires">{fmtTime(seen.expiresAt, true)}</KV>
          <KV label="Review ID" mono>
            {seen.id}
          </KV>
        </dl>
        {seen.offer.description && (
          <figure className="rounded border border-dashed p-3 text-sm">
            <figcaption className="mb-1 text-xs text-muted-foreground">
              Provider description · untrusted content
            </figcaption>
            <blockquote>{seen.offer.description}</blockquote>
          </figure>
        )}
        {changed && (
          <div role="alert" className="border-l-4 border-warning bg-warning-soft p-3 text-sm">
            <p>The review changed. Check the latest offer before deciding.</p>
            <Button
              variant="outline"
              disabled={action.isPending}
              onClick={() => {
                setSeen(structuredClone(review));
                action.reset();
              }}
            >
              Load latest offer
            </Button>
          </div>
        )}
        {expired && <p role="status">This review has expired.</p>}
        {action.error && <ErrorState error={action.error} />}
        <DialogFooter>
          <Button variant="outline" disabled={disabled} onClick={() => action.mutate('reject')}>
            Reject
          </Button>
          <Button disabled={disabled} onClick={() => action.mutate('approve')}>
            Approve purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
