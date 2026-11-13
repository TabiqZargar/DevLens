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
        "flex max-w-sm flex-col items-center gap-3 text-center",
        className,
      )}
    >
      {icon && (
        <div className="grid size-9 place-items-center rounded-md border border-line bg-base text-faint">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p className="text-xs leading-5 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
