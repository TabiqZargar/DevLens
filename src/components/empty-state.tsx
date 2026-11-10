import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex max-w-md flex-col items-center gap-4 text-center",
        className,
      )}
    >
      {icon && (
        <div className="grid size-11 place-items-center rounded-xl border border-line bg-raised/60 text-accent-strong">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p className="text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
