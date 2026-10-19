import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useIntents, useOperation, useReviews } from '@/api/hooks';
import {
  Badge,
  CopyButton,
  ErrorState,
  Field,
  Loading,
  Money,
  PageHeader,
  Section,
} from '@/components/sa/common';
import { ReviewCard } from '@/components/sa/review-card';
import { Button } from '@/components/ui/button';
import { REASON, host, outcome, path, shortHex } from '@/lib/labels';
import { fromNow, fullTime } from '@/lib/time';

export function PurchaseDetail() {
  const { id } = useParams({ strict: false }),
    q = useOperation(id ?? ''),
    intents = useIntents(),
    reviews = useReviews();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading />;
  const op = q.data;
  const intent = intents.data?.find((i) => i.taskId === op.taskId);
  const review = reviews.data
    ?.filter((r) => r.operationId === op.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const state = outcome(op);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4 h-8 text-muted-foreground">
        <Link to="/activity">
          <ArrowLeft aria-hidden />
          Activity
        </Link>
      </Button>
      <PageHeader
        title={host(op.url)}
        actions={op.offer && <Money value={op.offer.amount} className="text-2xl font-semibold" />}
      >
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={state.tone} icon={state.icon}>
            {state.text}
          </Badge>
          <time dateTime={op.createdAt} title={fullTime(op.createdAt)}>
            {fromNow(op.createdAt)}
          </time>
        </span>
      </PageHeader>

      {review?.status === 'pending' && (
        <Section title="Waiting for you">
          <ReviewCard review={review} showLink={false} />
        </Section>
      )}

      <Section title="Decision">
        <div className="rounded-xl border bg-card px-4 sm:px-5">
          <dl className="divide-y">
            {op.reason && <Field label="Reason">{REASON[op.reason]}</Field>}
            {op.message && <Field label="Details">{op.message}</Field>}
            {review && review.status !== 'pending' && (
              <Field label="Your review">
                {review.status === 'approved'
                  ? 'Approved'
                  : review.status === 'rejected'
                    ? 'Rejected'
                    : 'Expired without a decision'}
                {review.decidedAt && (
                  <span className="text-muted-foreground"> · {fromNow(review.decidedAt)}</span>
                )}
              </Field>
            )}
            {intent && (
              <Field label="Task">
                <Link to="/tasks/$id" params={{ id: intent.id }} className="hover:underline">
                  {intent.purpose}
                </Link>
              </Field>
            )}
          </dl>
        </div>
      </Section>

      <Section title="Payment">
        <div className="rounded-xl border bg-card px-4 sm:px-5">
          <dl className="divide-y">
            <Field label="Resource" mono>
              {path(op.url) || op.url}
            </Field>
            {op.offer ? (
              <>
                <Field label="Recipient" mono>
                  <span className="flex items-center gap-1" title={op.offer.payTo}>
                    {shortHex(op.offer.payTo, 6)}
                    <CopyButton value={op.offer.payTo} label="Copy recipient" className="size-7" />
                  </span>
                </Field>
                <Field label="Network">USDC on Base Sepolia</Field>
              </>
            ) : (
              <Field label="Price">
                {op.reason === 'free_content' ? 'Free' : 'No valid offer'}
              </Field>
            )}
            {op.settlement ? (
              <Field label="Transaction" mono>
                <a
                  href={op.settlement.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  {shortHex(op.settlement.txHash, 6)}
                  <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens Basescan)</span>
                </a>
              </Field>
            ) : (
              op.state === 'unknown' && (
                <Field label="Transaction">Not confirmed yet. Counted as spent until it is.</Field>
              )
            )}
            <Field label="Updated">{fullTime(op.updatedAt)}</Field>
          </dl>
        </div>
      </Section>

      {op.offer?.description && (
        <details className="group mb-10 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Merchant's description
          </summary>
          <p className="mt-2 rounded-lg bg-muted p-3 text-muted-foreground">
            Written by the merchant, not verified.
            <span className="mt-2 block whitespace-pre-wrap text-foreground">
              {op.offer.description}
            </span>
          </p>
        </details>
      )}
      <p className="font-mono text-xs text-muted-foreground">{op.id}</p>
    </>
  );
}
