import { Link } from '@tanstack/react-router';
import type { Intent, Operation, Task } from '@semanticauth/contracts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Money, fmtTime } from './common';
import { StatusBadge } from './status';
import { deliveryLabel, operationHost, paymentLabel } from '@/lib/operation-display';

export function PurchaseTable({
  operations,
  intents = [],
  tasks = [],
}: {
  operations: Operation[];
  intents?: Intent[];
  tasks?: Task[];
}) {
  const purpose = (op: Operation) =>
    intents.find((i) => i.id === tasks.find((t) => t.id === op.taskId)?.intentId)?.purpose ??
    op.taskId;
  return (
    <>
      <div className="space-y-3 lg:hidden">
        {operations.map((op) => (
          <article key={op.id} className="rounded-md border bg-card p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <Link
                to="/activity/$id"
                params={{ id: op.id }}
                className="min-w-0 break-all font-medium text-primary"
              >
                {operationHost(op)}
              </Link>
              {op.offer ? (
                <Money value={op.offer.amount} />
              ) : (
                <span className="text-xs">Amount not reported</span>
              )}
            </div>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {new URL(op.url).pathname}
            </p>
            <p className="my-2 break-words text-xs text-muted-foreground">
              <time dateTime={op.createdAt}>{fmtTime(op.createdAt, true)}</time> · {purpose(op)}
            </p>
            <dl>
              <dt className="text-xs text-muted-foreground">Decision</dt>
              <dd>{op.verdict ? <StatusBadge value={op.verdict} /> : 'Not reported'}</dd>
              <dt className="mt-2 text-xs text-muted-foreground">Payment</dt>
              <dd className="text-sm">{paymentLabel(op)}</dd>
              <dt className="mt-2 text-xs text-muted-foreground">Delivery</dt>
              <dd className="text-sm">{deliveryLabel(op)}</dd>
            </dl>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {['Time', 'Service', 'Task', 'Amount', 'Decision', 'Payment', 'Delivery'].map((h) => (
                <TableHead key={h} scope="col">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {operations.map((op) => (
              <TableRow key={op.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  <time dateTime={op.createdAt} title={fmtTime(op.createdAt, true)}>
                    {fmtTime(op.createdAt)}
                    <span className="mt-1 block text-muted-foreground">
                      {new Date(op.createdAt).toLocaleDateString(undefined, { dateStyle: 'short' })}
                    </span>
                  </time>
                </TableCell>
                <TableCell>
                  <Link
                    to="/activity/$id"
                    params={{ id: op.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {operationHost(op)}
                  </Link>
                  <span
                    className="mt-1 block max-w-56 truncate font-mono text-xs text-muted-foreground"
                    title={op.url}
                  >
                    {new URL(op.url).pathname}
                  </span>
                </TableCell>
                <TableCell className="max-w-48 truncate text-xs" title={purpose(op)}>
                  {purpose(op)}
                </TableCell>
                <TableCell>
                  {op.offer ? (
                    <Money value={op.offer.amount} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Not reported</span>
                  )}
                </TableCell>
                <TableCell>
                  {op.verdict ? <StatusBadge value={op.verdict} /> : 'Not reported'}
                </TableCell>
                <TableCell className="text-xs">{paymentLabel(op)}</TableCell>
                <TableCell className="text-xs">{deliveryLabel(op)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
