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
  neutral: "border-line bg-white/[0.035] text-muted",
  accent: "border-accent/30 bg-accent/10 text-accent-strong",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  outline: "border-line text-faint",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.13em]",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
