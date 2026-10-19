import { Link, useParams } from '@tanstack/react-router';
import { useOperation, useTasks, useIntents, useReviews } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  ErrorState,
  Loading,
  KV,
  Money,
  Panel,
  fmtTime,
  Unsupported,
} from '@/components/sa/common';
import { StatusBadge } from '@/components/sa/status';
import { paymentLabel, deliveryLabel, operationHost } from '@/lib/operation-display';
import { PurchaseReviewDialog } from '@/components/sa/review-queue';
export function PurchaseDetail() {
  const { id } = useParams({ strict: false }),
    q = useOperation(id ?? ''),
    tasks = useTasks(),
    intents = useIntents(),
    reviews = useReviews();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading />;
  const op = q.data,
    task = tasks.data?.find((t) => t.id === op.taskId),
    intent = intents.data?.find((i) => i.id === task?.intentId),
    review = reviews.data?.find((r) => r.operationId === op.id && r.status === 'pending');
  return (
    <>
      <Button asChild variant="ghost" className="mb-3 -ml-2">
        <Link to="/activity">← Activity</Link>
      </Button>
      <PageHeader
        title={operationHost(op)}
        description={fmtTime(op.createdAt, true)}
        actions={
          op.state === 'awaiting_review' && review ? (
            <PurchaseReviewDialog review={review} />
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        <div className="bg-card p-4">
          <p className="mb-1 text-xs text-muted-foreground">Amount</p>
          {op.offer ? <Money value={op.offer.amount} /> : <p className="text-sm">Not reported</p>}
        </div>
        <div className="bg-card p-4">
          <p className="mb-1 text-xs text-muted-foreground">Decision</p>
          {op.verdict ? (
            <StatusBadge value={op.verdict} />
          ) : (
            <p className="text-sm">Not reported</p>
          )}
        </div>
        <div className="bg-card p-4">
          <p className="mb-1 text-xs text-muted-foreground">Payment</p>
          <p className="text-sm">{paymentLabel(op)}</p>
        </div>
        <div className="bg-card p-4">
          <p className="mb-1 text-xs text-muted-foreground">Delivery</p>
          <p className="text-sm">{deliveryLabel(op)}</p>
        </div>
      </div>
      {op.state === 'awaiting_review' && reviews.error && (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Panel title="Approved purpose & actual purchase">
            <dl>
              {intent && (
                <KV stackOnMobile label="Approved purpose">
                  <Link
                    to="/mandates/$id"
                    params={{ id: intent.id }}
                    className="text-primary hover:underline"
                  >
                    {intent.purpose}
                  </Link>
                </KV>
              )}
              <KV stackOnMobile label="Resource" mono>
                {op.url}
              </KV>
              <KV stackOnMobile label="Task ID" mono>
                {op.taskId}
              </KV>
              {op.offer && (
                <>
                  <KV stackOnMobile label="Recipient" mono>
                    {op.offer.payTo}
                  </KV>
                  <KV label="Network">{op.offer.network}</KV>
                  <KV label="Payment scheme">{op.offer.scheme}</KV>
                </>
              )}
            </dl>
          </Panel>
          <Panel title="Decision reasons">
            <p className="text-sm">{op.message ?? 'No explanation reported.'}</p>
            {op.reason && <p className="mt-2 font-mono text-xs">{op.reason}</p>}
          </Panel>
          {op.offer?.description && (
            <Panel title="Provider description · untrusted content">
              <blockquote className="border-l-2 pl-3 text-sm">{op.offer.description}</blockquote>
            </Panel>
          )}
          <Unsupported>
            Returned data, full event history, disclosed inputs, request/offer hashes and detailed
            Jev evidence are not exposed by the dashboard API.
          </Unsupported>
        </div>
        <div className="min-w-0">
          <Panel title="Current operation state">
            <StatusBadge value={op.state} />
            <dl className="mt-3">
              <KV label="Requested">{fmtTime(op.createdAt, true)}</KV>
              <KV label="Last updated">{fmtTime(op.updatedAt, true)}</KV>
            </dl>
          </Panel>
          <Panel title="Transaction evidence">
            {op.settlement ? (
              <>
                <a
                  href={`https://sepolia.basescan.org/tx/${encodeURIComponent(op.settlement.txHash)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-xs text-primary underline"
                >
                  {op.settlement.txHash}
                  <span className="sr-only"> (opens Base Sepolia explorer)</span>
                </a>
                <p className="mt-2 text-xs text-muted-foreground">
                  Settlement reported by the gateway.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No settlement evidence reported.</p>
            )}
          </Panel>
          <Panel title="Record identifiers">
            <dl>
              <KV stackOnMobile label="Operation ID" mono>
                {op.id}
              </KV>
              {review && (
                <KV stackOnMobile label="Review ID" mono>
                  {review.id}
                </KV>
              )}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
