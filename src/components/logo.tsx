import { APP_NAME } from "../shared/constants";
import { cn } from "./cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-8 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent-strong",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="size-[18px]"
      >
        <circle cx="10.5" cy="10.5" r="5.25" />
        <path d="m14.4 14.4 4.1 4.1" />
      </svg>
    </span>
  );
}

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold tracking-tight text-ink">
          {APP_NAME}
        </div>
        {!compact && (
          <div className="truncate text-[10px] font-medium text-faint">
            Developer toolkit
          </div>
        )}
      </div>
    </div>
  );
}
