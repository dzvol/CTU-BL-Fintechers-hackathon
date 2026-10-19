import { ShieldCheck } from 'lucide-react';

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"
      >
        <ShieldCheck className="size-4" strokeWidth={2.25} />
      </span>
      SemanticAuth
    </span>
  );
}
