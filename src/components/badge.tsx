import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "outline";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "border-line bg-white/[0.03] text-muted",
  accent: "border-accent/25 bg-accent/[0.08] text-accent-strong",
  success: "border-success/25 bg-success/[0.08] text-success",
  warning: "border-warning/25 bg-warning/[0.08] text-warning",
  outline: "border-line bg-transparent text-faint",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium leading-4",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
