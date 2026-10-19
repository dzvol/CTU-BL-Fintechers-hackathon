import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Review } from '@semanticauth/contracts';
import { toast } from 'sonner';
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
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
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
  const action = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      decision === 'approve' ? approveReview(review.id) : rejectReview(review.id),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries();
      toast.success('Review decision recorded.');
    },
  });
  const expired = Date.parse(review.expiresAt) <= Date.now();
  const disabled = action.isPending || review.status !== 'pending' || expired;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
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
          <p>{review.reason}</p>
        </section>
        <dl>
          <KV label="Operation" mono>
            {review.operationId}
          </KV>
          <KV label="Resource" stackOnMobile mono>
            {review.offer.resourceUrl}
          </KV>
          <KV label="Recipient" mono>
            {review.offer.payTo}
          </KV>
          <KV label="Quoted amount">
            <Money value={review.offer.amount} />
          </KV>
          <KV label="Network">{review.offer.network}</KV>
          <KV label="Expires">{fmtTime(review.expiresAt, true)}</KV>
          <KV label="Review ID" mono>
            {review.id}
          </KV>
        </dl>
        {review.offer.description && (
          <figure className="rounded border border-dashed p-3 text-sm">
            <figcaption className="mb-1 text-xs text-muted-foreground">
              Provider description · untrusted content
            </figcaption>
            <blockquote>{review.offer.description}</blockquote>
          </figure>
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
