import {
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export interface TabItem<Id extends string> {
  id: Id;
  label: ReactNode;
}

export interface TabsProps<Id extends string> {
  items: readonly TabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  label: string;
  idPrefix: string;
  panelId: string;
  variant?: "workspace" | "compact";
  className?: string;
}

const VARIANTS = {
  workspace:
    "gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
  compact: "gap-1 rounded-md px-2 py-1 text-[10px] font-medium",
} as const;

export function Tabs<Id extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix,
  panelId,
  variant = "workspace",
  className,
}: TabsProps<Id>) {
  const tabRefs = useRef(new Map<Id, HTMLButtonElement>());

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % items.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
    }

    if (nextIndex === null) return;

    const next = items[nextIndex];

    if (!next) return;

    event.preventDefault();
    onChange(next.id);
    tabRefs.current.get(next.id)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex items-center", className)}
    >
      {items.map((item, index) => {
        const selected = item.id === value;

        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) {
                tabRefs.current.set(item.id, node);
              } else {
                tabRefs.current.delete(item.id);
              }
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${item.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex shrink-0 items-center transition",
              VARIANTS[variant],
              selected
                ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/25"
                : "text-faint hover:text-muted",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
