import type { ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-accent-strong">
          <span className="h-px w-6 bg-accent/60" />
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
