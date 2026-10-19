import { Ban, CheckCircle2, CircleDashed, Clock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
export function StatusBadge({ value }: { value: string }) {
  const success = ['approved', 'active', 'ALLOW', 'delivered', 'settled'].includes(value);
  const warning = ['pending_approval', 'awaiting_review', 'REVIEW', 'unknown'].includes(value);
  const danger = ['BLOCK', 'blocked', 'delivery_failed'].includes(value);
  const Icon = success
    ? CheckCircle2
    : warning
      ? ShieldAlert
      : danger
        ? Ban
        : value === 'requested'
          ? Clock
          : CircleDashed;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        success
          ? 'border-success/30 bg-success-soft text-success'
          : warning
            ? 'border-warning/30 bg-warning-soft text-warning'
            : danger
              ? 'border-destructive/30 bg-danger-soft text-destructive'
              : 'border-border bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {value.replaceAll('_', ' ')}
    </span>
  );
}
