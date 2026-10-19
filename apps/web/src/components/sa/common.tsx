import { AlertCircle, Check, Copy, Loader2, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { formatUsdc, type VerdictReason } from '@semanticauth/contracts';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { ApiError } from '@/api/http';
import { REASON, REASON_ICON, type Label, type Tone } from '@/lib/labels';
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
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {formatUsdc(value)}
      {unit && <span className="ml-1 text-[0.75em] font-normal text-muted-foreground">USDC</span>}
    </span>
  );
}

export function PageHeader({
  title,
  children,
  actions,
}: {
  title: string;
  /** One short line under the title, if the page needs it. */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · SemanticAuth`;
  }, [title]);
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <div className="mt-1.5 text-sm text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  count,
  actions,
  children,
  className,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-10 min-w-0', className)} aria-label={title}>
      <header className="mb-3 flex min-h-8 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

const TONE: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-destructive',
  info: 'bg-info-soft text-info',
  muted: 'bg-muted text-muted-foreground',
};
const DOT: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  muted: 'bg-muted-foreground/50',
};

export function Badge({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        TONE[tone],
      )}
    >
      {Icon ? (
        <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      ) : (
        <span aria-hidden className={cn('size-1.5 rounded-full', DOT[tone])} />
      )}
      {children}
    </span>
  );
}

/**
 * An icon that stands in for a short label. The label is its accessible name and shows as a
 * tooltip on hover; it sits above row links (z-10) so the hover reaches it.
 */
export function Hint({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('group/hint relative z-10 inline-flex shrink-0', className)}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-sm ring-1 ring-white/10 transition-opacity delay-150 group-hover/hint:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

/** A status (outcome, task state) as a tinted round icon. */
export function StatusIcon({ status, size = 'md' }: { status: Label; size?: 'sm' | 'md' }) {
  const Icon = status.icon;
  return (
    <Hint label={status.text}>
      <span
        className={cn(
          'grid place-items-center rounded-full',
          size === 'md' ? 'size-8' : 'size-6',
          TONE[status.tone],
        )}
      >
        <Icon aria-hidden className={size === 'md' ? 'size-4' : 'size-3.5'} strokeWidth={2.25} />
      </span>
    </Hint>
  );
}

/** Why the gateway decided what it did, as a small muted icon. */
export function ReasonIcon({ reason }: { reason: VerdictReason }) {
  const Icon = REASON_ICON[reason];
  return (
    <Hint label={REASON[reason]}>
      <Icon aria-hidden className="size-3.5" />
    </Hint>
  );
}

/**
 * Spent, reserved and what is left of `total`, as one bar. Widths come from bigint math so atomic
 * amounts never pass through floats.
 */
export function Meter({
  total,
  spent,
  reserved = '0',
  className,
  dark = false,
}: {
  total: string;
  spent: string;
  reserved?: string;
  className?: string;
  dark?: boolean;
}) {
  const t = BigInt(total);
  const pct = (part: string) =>
    t === 0n
      ? 0
      : Number((BigInt(part) * 1000n) / t > 1000n ? 1000n : (BigInt(part) * 1000n) / t) / 10;
  return (
    <div
      className={cn(
        'flex h-1.5 w-full overflow-hidden rounded-full',
        dark ? 'bg-sidebar-accent' : 'bg-muted',
        className,
      )}
      aria-hidden
    >
      <div
        className={dark ? 'bg-sidebar-foreground' : 'bg-foreground'}
        style={{ width: `${pct(spent)}%` }}
      />
      <div className="bg-warning" style={{ width: `${pct(reserved)}%` }} />
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-5 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.status === 0;
  const Icon = offline ? WifiOff : AlertCircle;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-destructive"
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        {offline
          ? 'Gateway unreachable.'
          : error instanceof Error
            ? error.message
            : 'Something went wrong.'}
      </p>
      {onRetry && (
        <Button size="sm" variant="ghost" className="h-8" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Label and value in a definition list. */
export function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 [overflow-wrap:anywhere]', mono && 'font-mono text-[13px]')}>
        {children}
      </dd>
    </div>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={cn('size-8 shrink-0', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          toast.error('Copy failed. Select the text and copy it manually.');
        }
      }}
    >
      {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}

/** A shell command or config snippet with a copy button. */
export function Code({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-sidebar py-1.5 pl-4 pr-1.5 text-sidebar-foreground">
      <pre className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[13px] leading-relaxed">
        {children}
      </pre>
      <CopyButton
        value={children}
        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      />
    </div>
  );
}
