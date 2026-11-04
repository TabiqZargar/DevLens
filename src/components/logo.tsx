import { APP_NAME } from "../shared/constants";
import { cn } from "./cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.7rem] bg-gradient-to-br from-accent via-[#7b8cff] to-cyan shadow-[0_10px_30px_-10px_rgba(139,124,255,0.9)]",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#080910"
        strokeWidth={2.1}
        strokeLinecap="round"
        className="size-5"
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
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold tracking-tight text-ink">
          {APP_NAME}
        </div>
        {!compact && (
          <div className="truncate text-[11px] font-medium tracking-wide text-faint">
            Developer toolkit
          </div>
        )}
      </div>
    </div>
  );
}
