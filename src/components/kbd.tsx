import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-base px-1.5 py-0.5 font-mono text-[11px] text-muted shadow-sm">
      {children}
    </kbd>
  );
}
