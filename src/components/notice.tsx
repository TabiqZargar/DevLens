import type { ReactNode } from "react";
import { cn } from "./cn";
import { AlertIcon, BracesIcon, CheckIcon } from "./icons";

export type NoticeKind = "success" | "info" | "warning" | "error";

const STYLES: Record<NoticeKind, string> = {
  success: "border-success/25 bg-success/[0.06]",
  info: "border-accent/25 bg-accent/[0.06]",
  warning: "border-warning/25 bg-warning/[0.06]",
  error: "border-danger/25 bg-danger/[0.06]",
};

const ICON_STYLES: Record<NoticeKind, string> = {
  success: "text-success",
  info: "text-accent-strong",
  warning: "text-warning",
  error: "text-danger",
};

export interface NoticeProps {
  kind: NoticeKind;
  message: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Notice({
  kind,
  message,
  children,
  action,
  className,
}: NoticeProps) {
  const Icon =
    kind === "success"
      ? CheckIcon
      : kind === "info"
        ? BracesIcon
        : AlertIcon;

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        STYLES[kind],
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          ICON_STYLES[kind],
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-ink">{message}</p>
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
