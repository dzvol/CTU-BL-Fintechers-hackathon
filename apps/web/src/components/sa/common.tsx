import { AlertCircle, Info, Loader2, WifiOff } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { formatUsdc } from '@semanticauth/contracts';
import { Button } from '../ui/button';
import { ApiError } from '@/api/http';
import { cn } from '@/lib/utils';

export function Money({
  value,
  className,
  unit = true,
}: {
  value: string;
  className?: string;
  unit?: boolean;
}) {
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {formatUsdc(value)}
      {unit && <span className="ml-1 text-[0.8em] text-muted-foreground">USDC</span>}
    </span>
  );
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · SemanticAuth`;
  }, [title]);
  return (
    <div className="mb-7 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b pb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="py-4">{children}</div>
    </section>
  );
}
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
export function ErrorState({
  error,
  onRetry,
  unavailableTitle = 'This feature is unavailable',
}: {
  error: unknown;
  onRetry?: () => void;
  unavailableTitle?: string;
}) {
  const offline = error instanceof ApiError && error.status === 0;
  const unsupported = error instanceof ApiError && error.status === 501;
  const Icon = offline ? WifiOff : unsupported ? Info : AlertCircle;
  return (
    <div
      role={unsupported ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-3 rounded-md border p-4 text-sm',
        unsupported ? 'bg-muted' : 'border-destructive/30 bg-danger-soft',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          unsupported ? 'text-muted-foreground' : 'text-destructive',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {unsupported ? unavailableTitle : offline ? 'Gateway unavailable' : "Couldn't load"}
        </p>
        {unsupported ? (
          <>
            <p className="mt-1 text-muted-foreground">
              This feature is not available on this gateway yet. You can continue using the rest of
              the dashboard.
            </p>
            <details className="mt-2">
              <summary className="min-h-6 cursor-pointer text-xs text-muted-foreground">
                Technical details
              </summary>
              <p className="mt-1 break-words font-mono text-xs">{error.message}</p>
            </details>
          </>
        ) : (
          <p>{error instanceof Error ? error.message : 'An unexpected error occurred.'}</p>
        )}
      </div>
      {onRetry && !unsupported && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
export function Unsupported({ children }: { children: ReactNode }) {
  return (
    <p className="my-4 border-l-4 border-warning bg-warning-soft p-3 text-sm">
      <strong>Backend limitation: </strong>
      {children}
    </p>
  );
}
export function KV({
  label,
  children,
  mono,
  stackOnMobile = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  stackOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 gap-3 py-2 text-sm',
        stackOnMobile
          ? 'grid-cols-1 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]'
          : 'grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]',
      )}
    >
      <dt className="text-muted-foreground [overflow-wrap:anywhere]">{label}</dt>
      <dd className={cn('min-w-0 [overflow-wrap:anywhere]', mono && 'font-mono text-xs')}>
        {children}
      </dd>
    </div>
  );
}
export function fmtTime(iso: string, withDate = false) {
  return new Date(iso).toLocaleString(
    undefined,
    withDate
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { hour: '2-digit', minute: '2-digit', second: '2-digit' },
  );
}
