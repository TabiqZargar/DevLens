import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertIcon,
  Button,
  cn,
  CopyIcon,
  EmptyState,
  NetworkIcon,
  Tabs,
  TrashIcon,
} from "../../components";
import { formatJson } from "../json/json-core";
import type {
  NetworkCaptureState,
  NetworkResponseContentResult,
} from "./network-capture";
import {
  createNetworkBodyPreview,
  createNetworkExportBody,
  getNetworkContentMimeType,
  NETWORK_BODY_PREVIEW_LIMIT_BYTES,
  type NetworkBodyPreview,
  type NetworkExportBody,
} from "./network-content";
import { createCurlCommand } from "./network-curl";
import {
  formatNetworkBytes,
  formatNetworkDuration,
  formatNetworkPath,
  formatNetworkResourceType,
  formatNetworkStartTime,
} from "./network-format";
import {
  createNetworkHar,
  createNetworkHarFilename,
  serializeNetworkHar,
} from "./network-har";
import {
  copyTextToClipboard,
  downloadTextFile,
} from "./network-io";
import {
  filterNetworkEntries,
  NETWORK_RESOURCE_TYPES,
  NETWORK_STATUS_CLASSES,
  type NetworkEntry,
  type NetworkFilters,
  type NetworkInitiator,
  type NetworkPostData,
  type NetworkResourceType,
  type NetworkStatusClass,
} from "./network-model";

type DetailTab = "overview" | "request" | "response" | "timing";

type ResponsePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: NetworkBodyPreview }
  | { status: "unavailable" }
  | { status: "failed" };

interface ActionFeedback {
  kind: "success" | "error";
  message: string;
}

type CopyState = "idle" | "copying" | "success" | "error";

const DETAIL_TABS: readonly { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "request", label: "Request" },
  { id: "response", label: "Response" },
  { id: "timing", label: "Timing" },
];

const STATUS_CLASS_LABELS: Record<NetworkStatusClass, string> = {
  success: "2xx success",
  redirect: "3xx redirect",
  "client-error": "4xx client error",
  "server-error": "5xx server error",
  failed: "Failed",
};

const STATUS_TEXT_TONES: Record<NetworkStatusClass, string> = {
  success: "text-success",
  redirect: "text-cyan",
  "client-error": "text-warning",
  "server-error": "text-danger",
  failed: "text-danger",
};

const FIELD_CLASS =
  "h-7 rounded-md border border-line bg-base/70 px-2 text-[11px] text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50";

export interface NetworkInspectorProps {
  state: NetworkCaptureState;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onLoadResponseContent: (
    entryId: string,
  ) => Promise<NetworkResponseContentResult>;
}

function captureStatusView(state: NetworkCaptureState): {
  label: string;
  className: string;
  dotClassName: string;
  description?: string;
} {
  if (state.status === "unavailable") {
    return {
      label: "Unavailable",
      className: "border-danger/25 bg-danger/[0.06] text-danger",
      dotClassName: "bg-danger",
      description: "The DevTools network API is not available.",
    };
  }

  if (state.status === "paused") {
    return {
      label: "Paused",
      className: "border-warning/25 bg-warning/[0.06] text-warning",
      dotClassName: "bg-warning",
    };
  }

  if (state.status === "running") {
    if (state.snapshotStatus === "failed") {
      return {
        label: "Live capture",
        className:
          "border-warning/25 bg-warning/[0.06] text-warning",
        dotClassName: "bg-warning",
        description:
          "The existing session could not be read. Live requests are still captured.",
      };
    }

    return {
      label:
        state.snapshotStatus === "loading"
          ? "Starting"
          : "Capturing",
      className:
        "border-success/25 bg-success/[0.06] text-success",
      dotClassName: "bg-success",
    };
  }

  return {
    label: "Starting",
    className: "border-line bg-white/[0.035] text-muted",
    dotClassName: "bg-faint",
  };
}

function RequestCount({
  filteredCount,
  totalCount,
}: {
  filteredCount: number;
  totalCount: number;
}) {
  const filtered = filteredCount !== totalCount;
  const primary = filtered ? filteredCount : totalCount;
  const noun =
    (filtered ? totalCount : primary) === 1
      ? "request"
      : "requests";

  return (
    <span
      aria-live="polite"
      className="whitespace-nowrap px-1 text-[10px] tabular-nums text-faint"
    >
      {filtered
        ? `${primary} of ${totalCount} ${noun}`
        : `${primary} ${noun}`}
    </span>
  );
}

interface NetworkToolbarProps {
  state: NetworkCaptureState;
  filteredCount: number;
  search: string;
  resourceType: NetworkResourceType | "all";
  statusClass: NetworkStatusClass | "all";
  onSearchChange: (value: string) => void;
  onResourceTypeChange: (
    value: NetworkResourceType | "all",
  ) => void;
  onStatusClassChange: (value: NetworkStatusClass | "all") => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onExportHar: () => void;
  exportFeedback: ActionFeedback | null;
}

function NetworkToolbar({
  state,
  filteredCount,
  search,
  resourceType,
  statusClass,
  onSearchChange,
  onResourceTypeChange,
  onStatusClassChange,
  onPause,
  onResume,
  onClear,
  onExportHar,
  exportFeedback,
}: NetworkToolbarProps) {
  const status = captureStatusView(state);
  const unavailable = state.status === "unavailable";
  const totalCount = state.entries.length;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-base/85 px-2 py-1.5">
      <span
        role="status"
        aria-live="polite"
        title={status.description}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[10px] font-medium",
          status.className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", status.dotClassName)}
        />
        {status.label}
      </span>

      {state.status === "paused" ? (
        <Button
          size="sm"
          className="h-7 px-2.5 text-[11px]"
          onClick={onResume}
        >
          Resume
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-[11px]"
          disabled={state.status !== "running"}
          onClick={onPause}
        >
          Pause
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-[11px]"
        disabled={unavailable || totalCount === 0}
        onClick={onClear}
      >
        <TrashIcon className="size-3.5" />
        Clear
      </Button>

      <Button
        size="sm"
        variant="secondary"
        className="h-7 px-2.5 text-[11px]"
        disabled={unavailable || totalCount === 0}
        title={
          totalCount === 0
            ? "No captured requests to export."
            : "Export the captured session as a HAR 1.2 file."
        }
        onClick={onExportHar}
      >
        Export HAR
      </Button>

      {exportFeedback !== null && (
        <span
          role={exportFeedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "max-w-48 truncate text-[10px]",
            exportFeedback.kind === "error"
              ? "text-danger"
              : "text-success",
          )}
          title={exportFeedback.message}
        >
          {exportFeedback.message}
        </span>
      )}

      <RequestCount
        filteredCount={filteredCount}
        totalCount={totalCount}
      />

      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
        <input
          type="search"
          aria-label="Search requests"
          placeholder="URL, host, or method"
          value={search}
          disabled={unavailable}
          onChange={(event) => onSearchChange(event.target.value)}
          className={cn(FIELD_CLASS, "w-44 font-mono")}
        />

        <select
          aria-label="Resource type"
          value={resourceType}
          disabled={unavailable}
          onChange={(event) =>
            onResourceTypeChange(
              event.target.value as NetworkResourceType | "all",
            )
          }
          className={cn(FIELD_CLASS, "max-w-36")}
        >
          <option value="all">All types</option>
          {NETWORK_RESOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {formatNetworkResourceType(type)}
            </option>
          ))}
        </select>

        <select
          aria-label="Status class"
          value={statusClass}
          disabled={unavailable}
          onChange={(event) =>
            onStatusClassChange(
              event.target.value as NetworkStatusClass | "all",
            )
          }
          className={cn(FIELD_CLASS, "max-w-36")}
        >
          <option value="all">All statuses</option>
          {NETWORK_STATUS_CLASSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_CLASS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function NetworkEmptyState({
  state,
  filteredCount,
  hasFilters,
  onClearFilters,
}: {
  state: NetworkCaptureState;
  filteredCount: number;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  const wrapperClass = "flex flex-1 items-center justify-center p-6";

  if (state.status === "unavailable") {
    return (
      <div className={wrapperClass}>
        <EmptyState
          className="max-w-sm gap-3"
          icon={<AlertIcon className="size-5" />}
          title="Network capture unavailable"
          description="The DevTools network API is not available in this panel. Reload DevTools and try again."
        />
      </div>
    );
  }

  if (state.entries.length === 0) {
    if (state.status === "paused") {
      return (
        <div className={wrapperClass}>
          <EmptyState
            className="max-w-sm gap-3"
            icon={<NetworkIcon className="size-5" />}
            title="Capture paused"
            description="Resume capture to record new requests from the inspected page."
          />
        </div>
      );
    }

    if (state.snapshotStatus === "loading") {
      return (
        <div className={wrapperClass}>
          <EmptyState
            className="max-w-sm gap-3"
            icon={<NetworkIcon className="size-5" />}
            title="Reading network session"
            description="Listening for live requests while the existing DevTools session is loaded."
          />
        </div>
      );
    }

    if (state.snapshotStatus === "failed") {
      return (
        <div className={wrapperClass}>
          <EmptyState
            className="max-w-sm gap-3"
            icon={<NetworkIcon className="size-5" />}
            title="Waiting for live requests"
            description="The existing session could not be read, but new requests will appear here as they finish."
          />
        </div>
      );
    }

    return (
      <div className={wrapperClass}>
        <EmptyState
          className="max-w-sm gap-3"
          icon={<NetworkIcon className="size-5" />}
          title="No requests captured yet"
          description="Interact with the inspected page or reload it. Requests appear here when they finish."
        />
      </div>
    );
  }

  if (filteredCount === 0) {
    return (
      <div className={wrapperClass}>
        <EmptyState
          className="max-w-sm gap-3"
          icon={<NetworkIcon className="size-5" />}
          title="No requests match"
          description="Adjust the search or filters to see captured requests."
          action={
            hasFilters ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={onClearFilters}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return null;
}

interface RequestRowProps {
  entry: NetworkEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}

const RequestRow = memo(function RequestRow({
  entry,
  selected,
  onSelect,
}: RequestRowProps) {
  const path = formatNetworkPath(entry.url);
  const statusText =
    entry.status === null
      ? "No response"
      : `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`;
  const size = entry.responseSizeBytes ?? entry.requestSizeBytes;
  const sizeTitle = `Request: ${formatNetworkBytes(entry.requestSizeBytes)} · Response: ${formatNetworkBytes(entry.responseSizeBytes)}`;

  function handleKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
  ): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(entry.id);
    }
  }

  return (
    <tr
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(entry.id)}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer border-b border-line/60 outline-none transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.05]",
        selected && "bg-accent/[0.09] hover:bg-accent/[0.12]",
      )}
    >
      <td
        className={cn(
          "px-2 py-1.5 font-mono text-[10px] font-medium",
          selected ? "text-accent-strong" : "text-muted",
        )}
      >
        {entry.method || "—"}
      </td>
      <td className="min-w-0 px-2 py-1.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {entry.host && (
            <span className="shrink-0 truncate font-mono text-[10px] text-faint">
              {entry.host}
            </span>
          )}
          <span
            className="truncate font-mono text-[11px] text-ink"
            title={entry.url || undefined}
          >
            {path}
          </span>
        </div>
      </td>
      <td
        className={cn(
          "px-2 py-1.5 font-mono text-[10px] tabular-nums",
          entry.status === null
            ? "text-faint"
            : STATUS_TEXT_TONES[entry.statusClass],
        )}
        title={statusText}
      >
        {entry.status ?? "—"}
      </td>
      <td className="hidden px-2 py-1.5 text-[10px] text-muted sm:table-cell">
        {formatNetworkResourceType(entry.resourceType)}
      </td>
      <td className="hidden px-2 py-1.5 text-right font-mono text-[10px] tabular-nums text-muted md:table-cell">
        {formatNetworkDuration(entry.durationMs)}
      </td>
      <td
        className="hidden px-2 py-1.5 text-right font-mono text-[10px] tabular-nums text-muted sm:table-cell"
        title={sizeTitle}
      >
        {formatNetworkBytes(size)}
      </td>
    </tr>
  );
});

function RequestTable({
  entries,
  selectedId,
  onSelect,
}: {
  entries: readonly NetworkEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="lens-scrollbar min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
          <tr className="border-b border-line text-[9px] uppercase tracking-[0.14em] text-faint">
            <th className="w-16 px-2 py-1.5 font-medium">Method</th>
            <th className="px-2 py-1.5 font-medium">URL</th>
            <th className="w-14 px-2 py-1.5 font-medium">Status</th>
            <th className="hidden w-20 px-2 py-1.5 font-medium sm:table-cell">
              Type
            </th>
            <th className="hidden w-20 px-2 py-1.5 text-right font-medium md:table-cell">
              Time
            </th>
            <th className="hidden w-20 px-2 py-1.5 text-right font-medium sm:table-cell">
              Size
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <RequestRow
              key={entry.id}
              entry={entry}
              selected={entry.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = true,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-all text-[11px] leading-5 text-ink",
          mono && "font-mono",
        )}
        title={title}
      >
        {value}
      </dd>
    </>
  );
}

function Overview({ entry }: { entry: NetworkEntry }) {
  const requestSize =
    entry.requestSizeBytes === null
      ? "Not available"
      : formatNetworkBytes(entry.requestSizeBytes);
  const responseSize =
    entry.responseSizeBytes === null
      ? "Not available"
      : formatNetworkBytes(entry.responseSizeBytes);
  const duration =
    entry.durationMs === null
      ? "Not available"
      : formatNetworkDuration(entry.durationMs);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-faint">
          URL
        </p>
        <p className="mt-0.5 break-all font-mono text-[11px] leading-5 text-ink">
          {entry.url || "Not available"}
        </p>
      </div>

      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
        <DetailRow label="Method" value={entry.method || "Not available"} />
        <DetailRow
          label="Status"
          value={
            entry.status === null
              ? "Not available"
              : `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`
          }
        />
        <DetailRow
          label="Type"
          value={formatNetworkResourceType(entry.resourceType)}
          mono={false}
        />
        <DetailRow
          label="Started"
          value={formatNetworkStartTime(entry.startedAt)}
          title={entry.startedAt ?? undefined}
        />
        <DetailRow label="Duration" value={duration} />
        <DetailRow
          label="Request size"
          value={requestSize}
          title={
            entry.requestSizeBytes === null
              ? undefined
              : `${entry.requestSizeBytes} bytes`
          }
        />
        <DetailRow
          label="Response size"
          value={responseSize}
          title={
            entry.responseSizeBytes === null
              ? undefined
              : `${entry.responseSizeBytes} bytes`
          }
        />
      </dl>

      <DetailSection
        title="Initiator"
        meta={
          entry.initiator && entry.initiator.frames.length > 0
            ? `${entry.initiator.frames.length} frames`
            : undefined
        }
      >
        <InitiatorDetails initiator={entry.initiator} />
      </DetailSection>
    </div>
  );
}

function formatInitiatorType(type: string | null): string {
  if (type === null) return "Not available";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function formatInitiatorLocation(
  lineNumber: number | null,
  columnNumber: number | null,
): string | null {
  if (lineNumber === null) return null;

  return columnNumber === null
    ? String(lineNumber)
    : `${lineNumber}:${columnNumber}`;
}

function InitiatorDetails({
  initiator,
}: {
  initiator: NetworkInitiator | null;
}) {
  if (initiator === null) {
    return (
      <p className="text-[11px] leading-5 text-faint">
        No initiator information captured.
      </p>
    );
  }

  const location = formatInitiatorLocation(
    initiator.lineNumber,
    initiator.columnNumber,
  );

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
        {initiator.type !== null && (
          <DetailRow
            label="Type"
            value={formatInitiatorType(initiator.type)}
            mono={false}
          />
        )}
        {initiator.url !== null && (
          <DetailRow
            label="Source"
            value={initiator.url}
            title={initiator.url}
          />
        )}
        {location !== null && (
          <DetailRow label="Location" value={location} />
        )}
      </dl>

      {initiator.frames.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-faint">
            Call stack
          </p>
          <ol className="mt-1 divide-y divide-line/60 overflow-hidden rounded-md border border-line/70 bg-base/30">
            {initiator.frames.map((frame, index) => {
              const frameLocation = formatInitiatorLocation(
                frame.lineNumber,
                frame.columnNumber,
              );

              return (
                <li
                  key={`${index}-${frame.url ?? ""}`}
                  className="px-2 py-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="truncate font-mono text-[10px] text-ink"
                      title={frame.functionName ?? undefined}
                    >
                      {frame.functionName || "(anonymous)"}
                    </span>
                    {frameLocation !== null && (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-faint">
                        {frameLocation}
                      </span>
                    )}
                  </div>
                  <p
                    className="truncate font-mono text-[10px] text-faint"
                    title={frame.url ?? undefined}
                  >
                    {frame.url
                      ? formatNetworkPath(frame.url)
                      : "Unknown source"}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function KeyValueList<T extends { name: string; value: string }>({
  items,
  empty,
}: {
  items: readonly T[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] leading-5 text-faint">{empty}</p>
    );
  }

  return (
    <dl className="divide-y divide-line/60 overflow-hidden rounded-md border border-line/70 bg-base/30">
      {items.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className="grid grid-cols-[minmax(88px,0.36fr)_minmax(0,1fr)] gap-3 px-2.5 py-1.5"
        >
          <dt className="break-words font-mono text-[10px] leading-5 text-faint">
            {item.name}
          </dt>
          <dd className="break-all font-mono text-[11px] leading-5 text-ink">
            {item.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
          {title}
        </h3>
        {meta && (
          <span className="text-[10px] tabular-nums text-faint">
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function PayloadText({
  text,
  mimeType,
}: {
  text: string;
  mimeType: string;
}) {
  const preview = useMemo(() => {
    if (text.trim().length === 0) {
      return { kind: "empty" as const };
    }

    const trimmed = text.trim();
    const looksJson =
      /json/i.test(mimeType) ||
      trimmed.startsWith("{") ||
      trimmed.startsWith("[");

    if (looksJson) {
      const formatted = formatJson(text);

      if (
        formatted.ok &&
        typeof formatted.output === "string" &&
        formatted.output.length > 0
      ) {
        return { kind: "json" as const, text: formatted.output };
      }
    }

    return { kind: "text" as const, text };
  }, [mimeType, text]);

  if (preview.kind === "empty") {
    return (
      <p className="text-[11px] leading-5 text-faint">
        Payload is empty.
      </p>
    );
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-faint">
        {preview.kind === "json" ? "JSON payload" : "Raw payload"}
      </p>
      <pre className="lens-scrollbar mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-base/60 p-2 font-mono text-[11px] leading-5 text-ink">
        {preview.text}
      </pre>
    </div>
  );
}

function PayloadView({ postData }: { postData: NetworkPostData | null }) {
  if (postData === null) {
    return (
      <p className="text-[11px] leading-5 text-faint">
        No request payload captured.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-faint">
          Content type
        </p>
        <p className="mt-0.5 break-all font-mono text-[11px] leading-5 text-ink">
          {postData.mimeType || "Not provided"}
        </p>
      </div>

      {postData.params.length > 0 && (
        <KeyValueList
          items={postData.params}
          empty="No payload parameters."
        />
      )}

      {postData.text === null ? (
        <p className="text-[11px] leading-5 text-faint">
          Raw payload is not available.
        </p>
      ) : (
        <PayloadText
          text={postData.text}
          mimeType={postData.mimeType}
        />
      )}
    </div>
  );
}

function RequestTab({ entry }: { entry: NetworkEntry }) {
  return (
    <div className="space-y-4">
      <DetailSection
        title="Headers"
        meta={String(entry.requestHeaders.length)}
      >
        <KeyValueList
          items={entry.requestHeaders}
          empty="No request headers captured."
        />
      </DetailSection>

      <DetailSection
        title="Query parameters"
        meta={String(entry.queryParams.length)}
      >
        <KeyValueList
          items={entry.queryParams}
          empty="No query parameters."
        />
      </DetailSection>

      <DetailSection title="Payload">
        <PayloadView postData={entry.postData} />
      </DetailSection>
    </div>
  );
}

function ResponseBodyPreview({
  state,
  contentAvailable,
  onLoad,
}: {
  state: ResponsePreviewState;
  contentAvailable: boolean;
  onLoad: () => void;
}) {
  if (!contentAvailable) {
    return (
      <p className="text-[11px] leading-5 text-faint">
        Response body is not available for this request.
      </p>
    );
  }

  if (state.status === "idle") {
    return (
      <div className="space-y-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-[11px]"
          onClick={onLoad}
        >
          Load response
        </Button>
        <p className="text-[10px] leading-4 text-faint">
          Content is requested only when you load it. DevLens does not
          save it.
        </p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div aria-live="polite" className="space-y-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-[11px]"
          disabled
        >
          Loading response…
        </Button>
        <p className="text-[10px] leading-4 text-faint">
          Reading the response body from DevTools.
        </p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <p className="text-[11px] leading-5 text-faint">
        Response body is no longer available.
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <div aria-live="polite" className="space-y-1.5">
        <p className="text-[11px] leading-5 text-warning">
          Could not load the response body.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-[11px]"
          onClick={onLoad}
        >
          Try again
        </Button>
      </div>
    );
  }

  const preview = state.preview;

  if (preview.kind === "empty") {
    return (
      <p className="text-[11px] leading-5 text-faint">
        Response body is empty.
      </p>
    );
  }

  if (preview.kind === "unsupported") {
    return (
      <div aria-live="polite" className="space-y-1.5">
        <p className="text-[11px] leading-5 text-warning">
          {preview.message}
        </p>
        {preview.mimeType.length > 0 && (
          <p className="break-all font-mono text-[10px] leading-4 text-faint">
            {preview.mimeType}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        aria-live="polite"
        className="flex items-baseline justify-between gap-2 text-[10px] text-faint"
      >
        <span
          className="truncate font-mono"
          title={preview.mimeType || undefined}
        >
          {preview.mimeType || "Unknown content type"}
        </span>
        <span>{preview.format === "json" ? "JSON" : "Text"}</span>
      </div>

      {preview.truncated && (
        <p className="text-[10px] leading-4 text-warning">
          Showing the first{" "}
          {formatNetworkBytes(NETWORK_BODY_PREVIEW_LIMIT_BYTES)}. The full
          response is not retained by DevLens.
        </p>
      )}

      <pre className="lens-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-base/60 p-2 font-mono text-[11px] leading-5 text-ink">
        {preview.text}
      </pre>
    </div>
  );
}

function ResponseTab({
  entry,
  responsePreview,
  onLoadResponse,
}: {
  entry: NetworkEntry;
  responsePreview: ResponsePreviewState;
  onLoadResponse: () => void;
}) {
  return (
    <div className="space-y-4">
      <DetailSection
        title="Headers"
        meta={String(entry.responseHeaders.length)}
      >
        <KeyValueList
          items={entry.responseHeaders}
          empty="No response headers captured."
        />
      </DetailSection>

      <DetailSection title="Body">
        <ResponseBodyPreview
          state={responsePreview}
          contentAvailable={entry.hasResponseContent}
          onLoad={onLoadResponse}
        />
      </DetailSection>
    </div>
  );
}

function TimingTab({ entry }: { entry: NetworkEntry }) {
  const duration =
    entry.durationMs === null
      ? "Not available"
      : formatNetworkDuration(entry.durationMs);

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
        <DetailRow
          label="Started"
          value={formatNetworkStartTime(entry.startedAt)}
          title={entry.startedAt ?? undefined}
        />
        <DetailRow label="Duration" value={duration} />
      </dl>
      <p className="text-[11px] leading-5 text-faint">
        Detailed DNS, connect, TLS, wait, and receive timings are not
        captured in this stage.
      </p>
    </div>
  );
}

function RequestDetails({
  entry,
  onLoadResponseContent,
  onResponseLoaded,
}: {
  entry: NetworkEntry;
  onLoadResponseContent: (
    entryId: string,
  ) => Promise<NetworkResponseContentResult>;
  onResponseLoaded: (
    entryId: string,
    body: NetworkExportBody | null,
  ) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [responsePreview, setResponsePreview] =
    useState<ResponsePreviewState>({ status: "idle" });
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(
    null,
  );
  const mountedRef = useRef(true);
  const loadTokenRef = useRef(0);
  const loadingRef = useRef(false);
  const responseMimeType = useMemo(
    () => getNetworkContentMimeType(entry.responseHeaders),
    [entry.responseHeaders],
  );
  const statusText =
    entry.status === null
      ? "No response"
      : `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleLoadResponse = useCallback(async () => {
    if (loadingRef.current || !entry.hasResponseContent) return;

    loadingRef.current = true;
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setResponsePreview({ status: "loading" });

    let result: NetworkResponseContentResult;

    try {
      result = await onLoadResponseContent(entry.id);
    } catch {
      result = { status: "failed" };
    }

    if (!mountedRef.current || token !== loadTokenRef.current) {
      return;
    }

    loadingRef.current = false;

    if (result.status === "unavailable") {
      setResponsePreview({ status: "unavailable" });
      return;
    }

    if (result.status === "failed") {
      setResponsePreview({ status: "failed" });
      return;
    }

    try {
      const preview = createNetworkBodyPreview({
        content: result.content,
        encoding: result.encoding,
        mimeType: responseMimeType,
      });

      setResponsePreview({
        status: "ready",
        preview,
      });
      onResponseLoaded(
        entry.id,
        createNetworkExportBody({
          content: result.content,
          encoding: result.encoding,
          mimeType: responseMimeType,
        }),
      );
    } catch {
      setResponsePreview({ status: "failed" });
      onResponseLoaded(entry.id, null);
    }
  }, [
    entry.hasResponseContent,
    entry.id,
    onLoadResponseContent,
    onResponseLoaded,
    responseMimeType,
  ]);

  const handleCopyCurl = useCallback(async () => {
    if (copyState === "copying") return;

    setCopyState("copying");
    setCopyFeedback(null);

    const result = createCurlCommand(entry);

    if (!result.ok) {
      setCopyState("error");
      setCopyFeedback("Request URL is unavailable.");
      return;
    }

    const copied = await copyTextToClipboard(result.command);

    if (!mountedRef.current) return;

    if (copied) {
      setCopyState("success");
      setCopyFeedback(
        "Copied cURL. It may contain credentials or sensitive headers.",
      );
      return;
    }

    setCopyState("error");
    setCopyFeedback("Could not copy the cURL command.");
  }, [copyState, entry]);

  return (
    <>
      <div className="shrink-0 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] font-semibold text-ink">
            {entry.method || "—"}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[10px]",
              entry.status === null
                ? "text-faint"
                : STATUS_TEXT_TONES[entry.statusClass],
            )}
          >
            {statusText}
          </span>
          <span className="truncate text-[10px] text-faint">
            {formatNetworkResourceType(entry.resourceType)}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto h-6 shrink-0 gap-1 px-2 text-[10px]"
            disabled={copyState === "copying"}
            title="Copy this request as a cURL command. It may include credentials or sensitive headers."
            onClick={handleCopyCurl}
          >
            <CopyIcon className="size-3" />
            {copyState === "copying" ? "Copying…" : "Copy as cURL"}
          </Button>
        </div>
        <p className="mt-1 break-all font-mono text-[10px] leading-4 text-muted">
          {entry.url || "No URL"}
        </p>
        {copyFeedback !== null && (
          <p
            role={copyState === "error" ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "mt-1 text-[10px] leading-4",
              copyState === "error" ? "text-danger" : "text-success",
            )}
          >
            {copyFeedback}
          </p>
        )}
      </div>

      <Tabs
        items={DETAIL_TABS}
        value={tab}
        onChange={setTab}
        label="Request detail sections"
        idPrefix="network-detail-tab"
        panelId="network-detail-panel"
        variant="compact"
        className="shrink-0 border-b border-line px-2 py-1"
      />

      <div
        role="tabpanel"
        id="network-detail-panel"
        aria-labelledby={`network-detail-tab-${tab}`}
        className="lens-scrollbar min-h-0 flex-1 overflow-auto p-3"
      >
        {tab === "overview" && <Overview entry={entry} />}
        {tab === "request" && <RequestTab entry={entry} />}
        {tab === "response" && (
          <ResponseTab
            entry={entry}
            responsePreview={responsePreview}
            onLoadResponse={handleLoadResponse}
          />
        )}
        {tab === "timing" && <TimingTab entry={entry} />}
      </div>
    </>
  );
}

function DetailsPlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <NetworkIcon className="size-5 text-faint" />
      <p className="text-xs font-medium text-muted">
        Select a request to inspect
      </p>
      <p className="max-w-[240px] text-[11px] leading-5 text-faint">
        Headers, query parameters, payload, timing details, and Copy as
        cURL appear here.
      </p>
    </div>
  );
}

export function NetworkInspector({
  state,
  onPause,
  onResume,
  onClear,
  onLoadResponseContent,
}: NetworkInspectorProps) {
  const [search, setSearch] = useState("");
  const [resourceType, setResourceType] = useState<
    NetworkResourceType | "all"
  >("all");
  const [statusClass, setStatusClass] = useState<
    NetworkStatusClass | "all"
  >("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedBodies, setLoadedBodies] = useState<
    ReadonlyMap<string, NetworkExportBody>
  >(() => new Map());
  const [exportFeedback, setExportFeedback] =
    useState<ActionFeedback | null>(null);

  useEffect(() => {
    setLoadedBodies((current) => {
      if (current.size === 0) return current;

      const ids = new Set(state.entries.map((entry) => entry.id));
      let changed = false;
      const next = new Map(current);

      for (const id of next.keys()) {
        if (!ids.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [state.entries]);

  const filters = useMemo<NetworkFilters>(
    () => ({ search, resourceType, statusClass }),
    [search, resourceType, statusClass],
  );

  const filteredEntries = useMemo(
    () => filterNetworkEntries(state.entries, filters),
    [state.entries, filters],
  );

  const selectedEntry = useMemo(
    () =>
      selectedId === null
        ? null
        : (state.entries.find((entry) => entry.id === selectedId) ??
          null),
    [state.entries, selectedId],
  );

  const hasFilters =
    search.trim().length > 0 ||
    resourceType !== "all" ||
    statusClass !== "all";

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleClear = useCallback(() => {
    setSelectedId(null);
    setLoadedBodies(new Map());
    setExportFeedback(null);
    onClear();
  }, [onClear]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setResourceType("all");
    setStatusClass("all");
  }, []);

  const handleResponseLoaded = useCallback(
    (entryId: string, body: NetworkExportBody | null) => {
      setLoadedBodies((current) => {
        const next = new Map(current);

        if (body === null) {
          next.delete(entryId);
        } else {
          next.set(entryId, body);
        }

        return next;
      });
    },
    [],
  );

  const handleExportHar = useCallback(() => {
    if (state.entries.length === 0) {
      setExportFeedback({
        kind: "error",
        message: "No captured requests to export.",
      });
      return;
    }

    try {
      const har = createNetworkHar({
        entries: state.entries,
        loadedBodies,
      });
      const contents = serializeNetworkHar(har);
      const filename = createNetworkHarFilename();
      const downloaded = downloadTextFile(
        filename,
        contents,
        "application/json",
      );

      if (!downloaded) {
        setExportFeedback({
          kind: "error",
          message: "Could not export the HAR file.",
        });
        return;
      }

      const noun =
        state.entries.length === 1 ? "request" : "requests";
      setExportFeedback({
        kind: "success",
        message: `Exported ${state.entries.length} ${noun}.`,
      });
    } catch {
      setExportFeedback({
        kind: "error",
        message: "Could not export the HAR file.",
      });
    }
  }, [loadedBodies, state.entries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NetworkToolbar
        state={state}
        filteredCount={filteredEntries.length}
        search={search}
        resourceType={resourceType}
        statusClass={statusClass}
        onSearchChange={setSearch}
        onResourceTypeChange={setResourceType}
        onStatusClassChange={setStatusClass}
        onPause={onPause}
        onResume={onResume}
        onClear={handleClear}
        onExportHar={handleExportHar}
        exportFeedback={exportFeedback}
      />

      {state.status === "unavailable" ? (
        <NetworkEmptyState
          state={state}
          filteredCount={0}
          hasFilters={false}
          onClearFilters={clearFilters}
        />
      ) : (
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_minmax(320px,38%)] lg:grid-rows-1",
            selectedEntry
              ? "grid-rows-[minmax(0,1fr)_minmax(0,1fr)]"
              : "grid-rows-1",
          )}
        >
          <section
            aria-label="Requests"
            className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-surface/55"
          >
            {filteredEntries.length === 0 ? (
              <NetworkEmptyState
                state={state}
                filteredCount={filteredEntries.length}
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
              />
            ) : (
              <RequestTable
                entries={filteredEntries}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            )}
          </section>

          <section
            aria-label="Request details"
            className={cn(
              "min-h-0 flex-col overflow-hidden rounded-md border border-line bg-surface/55",
              selectedEntry ? "flex" : "hidden lg:flex",
            )}
          >
            {selectedEntry ? (
              <RequestDetails
                key={selectedEntry.id}
                entry={selectedEntry}
                onLoadResponseContent={onLoadResponseContent}
                onResponseLoaded={handleResponseLoaded}
              />
            ) : (
              <DetailsPlaceholder />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
