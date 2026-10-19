import { useId, type ReactNode } from 'react';

export function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="h-10 min-w-0 rounded-md border bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}
