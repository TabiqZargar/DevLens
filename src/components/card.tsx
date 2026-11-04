import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface/85 shadow-[0_30px_80px_-60px_rgba(0,0,0,1)]",
        className,
      )}
      {...props}
    />
  );
}
