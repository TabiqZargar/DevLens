import { useMemo, useState } from "react";
import { cn } from "../../components/cn";
import { ChevronRightIcon } from "../../components/icons";
import {
  getJsonType,
  type JsonType,
  type JsonValue,
} from "./json-core";

const MAX_VISIBLE_CHILDREN = 100;
const MAX_TREE_DEPTH = 40;
const STRING_PREVIEW_LIMIT = 110;

const TYPE_STYLES: Record<JsonType, string> = {
  object: "border-accent/25 bg-accent/10 text-accent-strong",
  array: "border-success/25 bg-success/10 text-success",
  string: "border-cyan/25 bg-cyan/10 text-cyan",
  number: "border-warning/25 bg-warning/10 text-warning",
  boolean: "border-danger/25 bg-danger/10 text-danger",
  null: "border-line bg-white/[0.03] text-faint",
};

type ChildName = string | number;

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function primitivePreview(value: JsonValue): {
  text: string;
  title?: string;
} {
  if (typeof value === "string") {
    const truncated = value.length > STRING_PREVIEW_LIMIT;
    const sample = truncated ? value.slice(0, STRING_PREVIEW_LIMIT) : value;
    const quoted = JSON.stringify(sample);

    if (!truncated && quoted.length <= STRING_PREVIEW_LIMIT) {
      return { text: quoted };
    }

    const preview =
      quoted.length > STRING_PREVIEW_LIMIT
        ? `${quoted.slice(0, STRING_PREVIEW_LIMIT - 2)}…"`
        : `${quoted.slice(0, -1)}…"`;

    return {
      text: preview,
      title: value.length <= 2_000 ? JSON.stringify(value) : undefined,
    };
  }

  if (typeof value === "number" && Object.is(value, -0)) {
    return { text: "-0" };
  }

  return { text: String(value) };
}

interface ChildPage {
  total: number;
  shown: ReadonlyArray<readonly [ChildName, JsonValue]>;
}

function childPage(
  value: JsonValue,
  type: JsonType,
  limit: number,
): ChildPage {
  if (type === "array" && Array.isArray(value)) {
    return {
      total: value.length,
      shown: value
        .slice(0, limit)
        .map((child, index) => [index, child] as const),
    };
  }

  if (
    type === "object" &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const record = value as { [key: string]: JsonValue };
    const keys = Object.keys(record);
    return {
      total: keys.length,
      shown: keys
        .slice(0, limit)
        .map((key) => [key, record[key] as JsonValue] as const),
    };
  }

  return { total: 0, shown: [] };
}

interface JsonTreeNodeProps {
  value: JsonValue;
  depth: number;
  name?: ChildName;
  defaultExpanded?: boolean;
}

function JsonTreeNode({
  value,
  depth,
  name,
  defaultExpanded = false,
}: JsonTreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visibleChildren, setVisibleChildren] = useState(
    MAX_VISIBLE_CHILDREN,
  );

  const type = getJsonType(value);
  const isContainer = type === "object" || type === "array";
  const page = useMemo(
    () => childPage(value, type, visibleChildren),
    [value, type, visibleChildren],
  );
  const atDepthLimit = isContainer && depth >= MAX_TREE_DEPTH;
  const preview = isContainer ? null : primitivePreview(value);
  const nodeName =
    name === undefined
      ? "root"
      : typeof name === "number"
        ? `item ${name}`
        : JSON.stringify(name);

  return (
    <div className="font-mono text-[12.5px] leading-6">
      <div className="group flex items-start gap-1.5 rounded-md pr-2 hover:bg-white/[0.03]">
        {isContainer ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${nodeName}`}
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-white/[0.06] hover:text-ink"
          >
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform duration-150",
                expanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        )}

        <span className="min-w-0 flex-1 py-0.5">
          <span className="inline-flex flex-wrap items-baseline gap-2">
            {name !== undefined && (
              <>
                <span
                  className={cn(
                    "shrink-0",
                    typeof name === "number"
                      ? "text-faint"
                      : "text-accent-strong",
                  )}
                >
                  {typeof name === "number" ? name : JSON.stringify(name)}
                </span>
                <span className="text-faint">:</span>
              </>
            )}

            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em]",
                TYPE_STYLES[type],
              )}
            >
              {type}
            </span>

            {isContainer ? (
              <span className="text-muted">
                {pluralize(
                  page.total,
                  type === "array" ? "item" : "key",
                )}
              </span>
            ) : (
              <span
                title={preview?.title}
                className={cn(
                  "break-all",
                  type === "string" && "text-cyan",
                  type === "number" && "text-warning",
                  type === "boolean" && "text-danger",
                  type === "null" && "text-faint",
                )}
              >
                {preview?.text}
              </span>
            )}
          </span>
        </span>
      </div>

      {expanded && isContainer && (
        <div className="ml-3 border-l border-line/70 pl-3">
          {atDepthLimit ? (
            <p className="py-1 text-[11px] leading-5 text-faint">
              Depth limit reached at {MAX_TREE_DEPTH} levels. Use the text
              editor to inspect deeper content.
            </p>
          ) : (
            <>
              {page.shown.map(([childName, child]) => (
                <JsonTreeNode
                  key={String(childName)}
                  name={childName}
                  value={child}
                  depth={depth + 1}
                />
              ))}

              {visibleChildren < page.total && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleChildren(
                      (current) => current + MAX_VISIBLE_CHILDREN,
                    )
                  }
                  className="my-1 rounded-md px-2 py-1 text-[11px] text-accent-strong hover:bg-white/[0.05]"
                >
                  Show{" "}
                  {Math.min(
                    MAX_VISIBLE_CHILDREN,
                    page.total - visibleChildren,
                  )}{" "}
                  more…
                </button>
              )}

              {page.total === 0 && (
                <p className="py-1 text-[11px] leading-5 text-faint">
                  Empty {type}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ value }: { value: JsonValue }) {
  return (
    <div
      role="group"
      aria-label="JSON structure"
      className="lens-scrollbar max-h-[30rem] overflow-auto rounded-xl border border-line bg-base/70 p-3"
    >
      <JsonTreeNode value={value} depth={0} defaultExpanded />
    </div>
  );
}
