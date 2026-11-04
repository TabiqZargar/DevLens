import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[#080910] shadow-[0_12px_30px_-14px_rgba(139,124,255,0.9)] hover:bg-accent-strong active:translate-y-px",
  secondary:
    "border border-line bg-raised/70 text-ink hover:border-line-strong hover:bg-raised active:translate-y-px",
  ghost: "text-muted hover:bg-white/[0.05] hover:text-ink",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  fullWidth = false,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-medium transition duration-150 disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}
