import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertIcon,
  Badge,
  Button,
  Card,
  CheckIcon,
  cn,
  EmptyState,
  PageHeader,
  SendIcon,
  TrashIcon,
} from "../../components";
import { getModuleDefinition } from "../../shared/modules";
import { sendApiCancelMessage, sendApiExecutionMessage } from "../../services/api-execution";
import {
  hasOriginPermission,
  requestOriginPermission,
} from "../../services/permissions";
import {
  appendRow,
  BODY_CONTENT_TYPES,
  countEnabledRows,
  createRequestDraft,
  HTTP_METHODS,
  isBodyContentType,
  isDraftEmpty,
  isHttpMethod,
  removeRow,
  updateRow,
  validateRequestUrl,
  type ApiRequestDraft,
  type BodyContentType,
  type KeyValueRow,
  type KeyValueRowPatch,
} from "./api-request";
import {
  createApiExecutionRequest,
  type ApiExecutionError,
  type ApiExecutionErrorCode,
  type ApiResponseMetadata,
} from "./api-execution";
import {
  buildResponseBodyView,
  formatResponseStatus,
  responseStatusVariant,
} from "./api-response";

const module = getModuleDefinition("api");

type RequestSection = "params" | "headers" | "body";
type ResponseSection = "body" | "headers";

type SendState =
  | { phase: "idle" }
  | { phase: "sending"; requestId: string; cancelling: boolean }
  | { phase: "response"; requestId: string; data: ApiResponseMetadata }
  | { phase: "error"; requestId: string | null; error: ApiExecutionError };

interface Notice {
  kind: "success" | "warning";
  message: string;
}

const SECTIONS: readonly { id: RequestSection; label: string }[] = [
  { id: "params", label: "Params" },
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
];

const CONTENT_TYPE_LABELS: Record<BodyContentType, string> = {
  none: "No body",
  "application/json": "JSON (application/json)",
  "text/plain": "Text (text/plain)",
  "application/x-www-form-urlencoded":
    "Form URL encoded (application/x-www-form-urlencoded)",
};

const FIELD_CLASS =
  "h-9 rounded-lg border bg-base/70 px-3 font-mono text-xs text-ink placeholder:text-faint focus:outline-none";

const FIELD_FOCUS =
  "focus:border-accent/50 focus:ring-1 focus:ring-accent/30";

let requestSequence = 0;

function createExecutionRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  requestSequence += 1;
  return `api-request-${Date.now()}-${requestSequence}`;
}

function localError(
  code: ApiExecutionErrorCode,
  message: string,
): ApiExecutionError {
  return { code, message };
}

function errorBadgeLabel(error: ApiExecutionError): string {
  switch (error.code) {
    case "timeout":
      return "Timed out";
    case "aborted":
      return "Cancelled";
    case "permission-denied":
      return "Permission";
    case "response-too-large":
      return "Too large";
    default:
      return "Failed";
  }
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

function SectionEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid place-items-center px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-muted">
        {description}
      </p>
    </div>
  );
}

function StatusNotice({ notice }: { notice: Notice }) {
  const Icon = notice.kind === "success" ? CheckIcon : AlertIcon;

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-xl border px-4 py-3",
        notice.kind === "success"
          ? "border-accent/25 bg-accent/[0.06]"
          : "border-warning/25 bg-warning/[0.06]",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          notice.kind === "success"
            ? "text-accent-strong"
            : "text-warning",
        )}
      />
      <p className="text-sm font-medium text-ink">{notice.message}</p>
    </div>
  );
}

function Meta({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
      <p className="mt-0.5 break-all font-mono text-xs leading-5 text-ink">
        {value}
      </p>
    </div>
  );
}

function ResponseInspector({ data }: { data: ApiResponseMetadata }) {
  const [section, setSection] = useState<ResponseSection>("body");
  const bodyView = useMemo(
    () => buildResponseBodyView(data.body, data.contentType),
    [data.body, data.contentType],
  );

  return (
    <>
      <div className="grid gap-3 border-b border-line px-4 py-3 sm:grid-cols-2">
        <Meta label="Duration" value={`${data.durationMs} ms`} />
        <Meta
          label="Content type"
          value={data.contentType ?? "Not provided"}
        />
        <Meta label="Final URL" value={data.finalUrl} wide />
      </div>

      <div
        role="group"
        aria-label="Response sections"
        className="flex flex-wrap items-center gap-1 border-b border-line p-2"
      >
        <button
          type="button"
          aria-pressed={section === "body"}
          onClick={() => setSection("body")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
            section === "body"
              ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/25"
              : "text-faint hover:text-muted",
          )}
        >
          Body
        </button>
        <button
          type="button"
          aria-pressed={section === "headers"}
          onClick={() => setSection("headers")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
            section === "headers"
              ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/25"
              : "text-faint hover:text-muted",
          )}
        >
          Headers
          <span
            aria-hidden="true"
            className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-muted"
          >
            {data.headers.length}
          </span>
        </button>
      </div>

      {section === "body" ? (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-faint">
              Response body
            </span>
            {bodyView.kind === "json" && (
              <Badge variant="outline">JSON</Badge>
            )}
          </div>

          {bodyView.kind === "empty" ? (
            <p className="px-4 py-8 text-center text-xs text-muted">
              The response body is empty.
            </p>
          ) : (
            <>
              {bodyView.kind === "text" && bodyView.note && (
                <p className="border-b border-line bg-warning/[0.04] px-4 py-2 text-[11px] text-warning">
                  {bodyView.note}
                </p>
              )}
              <pre
                aria-label="Response body"
                className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words bg-base/40 px-4 py-3 font-mono text-xs leading-6 text-ink"
              >
                {bodyView.text}
              </pre>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center border-b border-line px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-faint">
              Response headers
            </span>
          </div>

          {data.headers.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">
              No response headers were exposed.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.headers.map((header, index) => (
                <li
                  key={`${header.name}-${index}`}
                  className="grid gap-1 px-4 py-2 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-3"
                >
                  <code className="break-all font-mono text-xs text-accent-strong">
                    {header.name}
                  </code>
                  <code className="break-all font-mono text-xs text-ink">
                    {header.value}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function RowEditor({
  title,
  description,
  addLabel,
  rows,
  keyPlaceholder,
  valuePlaceholder,
  fieldLabel,
  itemLabel,
  emptyTitle,
  emptyDescription,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  description: string;
  addLabel: string;
  rows: readonly KeyValueRow[];
  keyPlaceholder: string;
  valuePlaceholder: string;
  fieldLabel: string;
  itemLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  onAdd: () => void;
  onUpdate: (id: string, patch: KeyValueRowPatch) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-faint">{description}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onAdd}>
          {addLabel}
        </Button>
      </div>

      {rows.length === 0 ? (
        <SectionEmpty
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:px-4",
                !row.enabled && "opacity-60",
              )}
            >
              <input
                type="checkbox"
                checked={row.enabled}
                aria-label={`Enable ${itemLabel} ${index + 1}`}
                onChange={(event) =>
                  onUpdate(row.id, {
                    enabled: event.target.checked,
                  })
                }
                className="size-4 shrink-0 accent-accent"
              />
              <input
                value={row.key}
                aria-label={`${fieldLabel} key ${index + 1}`}
                onChange={(event) =>
                  onUpdate(row.id, { key: event.target.value })
                }
                placeholder={keyPlaceholder}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  FIELD_CLASS,
                  FIELD_FOCUS,
                  "w-full border-line",
                )}
              />
              <input
                value={row.value}
                aria-label={`${fieldLabel} value ${index + 1}`}
                onChange={(event) =>
                  onUpdate(row.id, { value: event.target.value })
                }
                placeholder={valuePlaceholder}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  FIELD_CLASS,
                  FIELD_FOCUS,
                  "w-full border-line",
                )}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${itemLabel} ${index + 1}`}
                onClick={() => onRemove(row.id)}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ApiBuilderScreen() {
  const [draft, setDraft] =
    useState<ApiRequestDraft>(createRequestDraft);
  const [activeSection, setActiveSection] =
    useState<RequestSection>("params");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [sendState, setSendState] = useState<SendState>({
    phase: "idle",
  });
  const [preparing, setPreparing] = useState(false);

  const busyRef = useRef(false);
  const cancelPendingRef = useRef(false);
  const lastRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      lastRequestIdRef.current = null;
    };
  }, []);

  const urlValidation = validateRequestUrl(draft.url);
  const urlError =
    draft.url.trim().length > 0 && !urlValidation.ok
      ? urlValidation.message
      : null;
  const urlHelp =
    draft.url.trim().length === 0
      ? "Use an absolute http:// or https:// URL. Send asks for access to that origin."
      : urlValidation.ok
        ? "URL format valid. Send asks Chrome for access to this origin."
        : null;

  const counts: Record<RequestSection, number> = {
    params: countEnabledRows(draft.params),
    headers: countEnabledRows(draft.headers),
    body: draft.body.content.trim().length > 0 ? 1 : 0,
  };

  const sending = sendState.phase === "sending";
  const sendDisabled = preparing || sending || !urlValidation.ok;
  const sendLabel = preparing
    ? "Checking access…"
    : sending
      ? "Sending…"
      : "Send";

  const bodyPlaceholder =
    draft.body.contentType === "none"
      ? "Select a content type to start writing a body."
      : draft.body.contentType === "application/json"
        ? '{\n  "key": "value"\n}'
        : "Paste or type the request body.";

  function updateDraft(
    updater: (current: ApiRequestDraft) => ApiRequestDraft,
  ) {
    setDraft(updater);
    setNotice(null);
  }

  function handleMethodChange(value: string) {
    if (!isHttpMethod(value)) return;
    updateDraft((current) => ({ ...current, method: value }));
  }

  function handleContentTypeChange(value: string) {
    if (!isBodyContentType(value)) return;
    updateDraft((current) => ({
      ...current,
      body: { ...current.body, contentType: value },
    }));
  }

  function handleReset() {
    if (busyRef.current) return;

    lastRequestIdRef.current = null;
    setDraft(createRequestDraft());
    setActiveSection("params");
    setSendState({ phase: "idle" });
    setCancelNotice(null);
    setNotice({
      kind: "success",
      message: "Reset the request editor. The response was cleared.",
    });
  }

  async function handleSend() {
    if (busyRef.current) return;

    const validation = validateRequestUrl(draft.url);
    if (!validation.ok) return;

    busyRef.current = true;
    const requestId = createExecutionRequestId();
    lastRequestIdRef.current = requestId;
    setNotice(null);
    setCancelNotice(null);
    setPreparing(true);

    try {
      const url = draft.url.trim();
      const permitted = await hasOriginPermission(url);
      if (lastRequestIdRef.current !== requestId) return;

      if (!permitted) {
        const granted = await requestOriginPermission(url);
        if (lastRequestIdRef.current !== requestId) return;

        if (!granted) {
          setSendState({
            phase: "error",
            requestId,
            error: localError(
              "permission-denied",
              "Permission to access this origin was not granted.",
            ),
          });
          return;
        }
      }

      setPreparing(false);
      setSendState({ phase: "sending", requestId, cancelling: false });

      const response = await sendApiExecutionMessage(
        createApiExecutionRequest(draft, requestId),
      );

      if (lastRequestIdRef.current !== requestId) return;

      setCancelNotice(null);

      if (response.ok) {
        setSendState({
          phase: "response",
          requestId,
          data: response.data,
        });
      } else {
        setSendState({
          phase: "error",
          requestId,
          error: response.error,
        });
      }
    } finally {
      busyRef.current = false;
      if (lastRequestIdRef.current === requestId) {
        setPreparing(false);
      }
    }
  }

  async function handleCancel() {
    if (
      sendState.phase !== "sending" ||
      sendState.cancelling ||
      cancelPendingRef.current
    ) {
      return;
    }

    cancelPendingRef.current = true;
    const requestId = sendState.requestId;
    setSendState({ phase: "sending", requestId, cancelling: true });
    setCancelNotice(null);

    try {
      const response = await sendApiCancelMessage(requestId);
      if (lastRequestIdRef.current !== requestId) return;

      if (response.ok) return;

      setSendState((current) =>
        current.phase === "sending" &&
        current.requestId === requestId
          ? { ...current, cancelling: false }
          : current,
      );
      setCancelNotice(
        "The request could not be cancelled. It may still complete.",
      );
    } finally {
      cancelPendingRef.current = false;
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description="Compose a request with a method, URL, query parameters, headers, and a body. Press Send to run it through the extension background."
        actions={<Badge variant="accent">Opt-in network</Badge>}
      />

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <label htmlFor="api-method" className="sr-only">
              HTTP method
            </label>
            <select
              id="api-method"
              value={draft.method}
              onChange={(event) =>
                handleMethodChange(event.target.value)
              }
              className={cn(
                FIELD_CLASS,
                FIELD_FOCUS,
                "w-28 shrink-0 border-line font-semibold uppercase tracking-[0.08em] [color-scheme:dark]",
              )}
            >
              {HTTP_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[14rem] flex-1">
            <label htmlFor="api-url" className="sr-only">
              Request URL
            </label>
            <input
              id="api-url"
              type="url"
              inputMode="url"
              value={draft.url}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  url: event.target.value,
                }))
              }
              aria-invalid={urlError ? true : undefined}
              aria-describedby="api-url-help"
              placeholder="https://api.example.com/users"
              spellCheck={false}
              autoComplete="off"
              className={cn(
                FIELD_CLASS,
                FIELD_FOCUS,
                "w-full",
                urlError ? "border-danger/60" : "border-line",
              )}
            />
          </div>

          <Button
            variant="primary"
            onClick={() => void handleSend()}
            disabled={sendDisabled}
            aria-busy={preparing || sending}
            aria-describedby="api-send-note"
            title={
              urlValidation.ok
                ? "Send this request through the extension background"
                : "Enter a valid URL to send"
            }
          >
            {preparing || sending ? (
              <Spinner />
            ) : (
              <SendIcon className="size-3.5" />
            )}
            {sendLabel}
          </Button>

          {sending && (
            <Button
              variant="secondary"
              onClick={() => void handleCancel()}
              disabled={sendState.cancelling}
            >
              {sendState.cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={isDraftEmpty(draft) || preparing || sending}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon className="size-3.5" />
            Reset
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            id="api-url-help"
            role={urlError ? "alert" : undefined}
            className={cn(
              "text-[11px] leading-5",
              urlError ? "text-danger" : "text-faint",
            )}
          >
            {urlError ?? urlHelp}
          </p>
          <Badge variant="outline">In-memory draft</Badge>
        </div>
        <span id="api-send-note" className="sr-only">
          Send asks Chrome for access to the request origin.
        </span>
      </Card>

      {notice && <StatusNotice notice={notice} />}

      {cancelNotice && (
        <StatusNotice
          notice={{ kind: "warning", message: cancelNotice }}
        />
      )}

      <Card className="overflow-hidden">
        <div
          role="group"
          aria-label="Request sections"
          className="flex flex-wrap items-center gap-1 border-b border-line p-2"
        >
          {SECTIONS.map((section) => {
            const active = activeSection === section.id;
            const count = counts[section.id];

            return (
              <button
                key={section.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/25"
                    : "text-faint hover:text-muted",
                )}
              >
                {section.label}
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-muted"
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeSection === "params" && (
          <RowEditor
            title="Query parameters"
            description="Enabled rows with a key are appended to the URL when you send."
            addLabel="Add parameter"
            rows={draft.params}
            keyPlaceholder="key"
            valuePlaceholder="value"
            fieldLabel="Parameter"
            itemLabel="parameter"
            emptyTitle="No query parameters"
            emptyDescription="Add a parameter to build a query string. Blank and disabled rows are ignored."
            onAdd={() =>
              updateDraft((current) => ({
                ...current,
                params: appendRow(current.params),
              }))
            }
            onUpdate={(id, patch) =>
              updateDraft((current) => ({
                ...current,
                params: updateRow(current.params, id, patch),
              }))
            }
            onRemove={(id) =>
              updateDraft((current) => ({
                ...current,
                params: removeRow(current.params, id),
              }))
            }
          />
        )}

        {activeSection === "headers" && (
          <RowEditor
            title="Request headers"
            description="Enabled rows with a key are sent with the request. Values stay in memory."
            addLabel="Add header"
            rows={draft.headers}
            keyPlaceholder="Header-Name"
            valuePlaceholder="value"
            fieldLabel="Header"
            itemLabel="header"
            emptyTitle="No request headers"
            emptyDescription="Add a header to include it when you send. Values are never stored."
            onAdd={() =>
              updateDraft((current) => ({
                ...current,
                headers: appendRow(current.headers),
              }))
            }
            onUpdate={(id, patch) =>
              updateDraft((current) => ({
                ...current,
                headers: updateRow(current.headers, id, patch),
              }))
            }
            onRemove={(id) =>
              updateDraft((current) => ({
                ...current,
                headers: removeRow(current.headers, id),
              }))
            }
          />
        )}

        {activeSection === "body" && (
          <div>
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">
                Request body
              </h2>
              <p className="mt-0.5 text-xs text-faint">
                Choose a content type, then write the body. It stays in
                memory and is sent only when you press Send.
              </p>
            </div>

            <div className="grid gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="api-body-content-type"
                  className="text-[10px] uppercase tracking-[0.16em] text-faint"
                >
                  Content type
                </label>
                <select
                  id="api-body-content-type"
                  value={draft.body.contentType}
                  onChange={(event) =>
                    handleContentTypeChange(event.target.value)
                  }
                  className={cn(
                    FIELD_CLASS,
                    FIELD_FOCUS,
                    "w-auto min-w-[16rem] border-line [color-scheme:dark]",
                  )}
                >
                  {BODY_CONTENT_TYPES.map((contentType) => (
                    <option key={contentType} value={contentType}>
                      {CONTENT_TYPE_LABELS[contentType]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="api-body" className="sr-only">
                  Request body
                </label>
                <textarea
                  id="api-body"
                  value={draft.body.content}
                  disabled={draft.body.contentType === "none"}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      body: {
                        ...current.body,
                        content: event.target.value,
                      },
                    }))
                  }
                  placeholder={bodyPlaceholder}
                  spellCheck={false}
                  autoComplete="off"
                  className="min-h-[12rem] w-full resize-y rounded-xl border border-line bg-base/70 px-3 py-2.5 font-mono text-xs leading-6 text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
                />
                {draft.body.contentType === "none" && (
                  <p className="mt-2 text-[11px] text-faint">
                    Choose a content type to enable the body editor.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden" aria-busy={sending}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Response</h2>
            {sendState.phase === "response" && (
              <Badge
                variant={responseStatusVariant(sendState.data.status)}
              >
                {formatResponseStatus(
                  sendState.data.status,
                  sendState.data.statusText,
                )}
              </Badge>
            )}
            {sendState.phase === "sending" && (
              <Badge variant="accent">
                {sendState.cancelling ? "Cancelling" : "In flight"}
              </Badge>
            )}
            {sendState.phase === "error" && (
              <Badge variant="warning">
                {errorBadgeLabel(sendState.error)}
              </Badge>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-faint">
            {sendState.phase === "sending"
              ? "Awaiting response"
              : "In memory"}
          </span>
        </div>

        {sendState.phase === "idle" && (
          <div className="grid place-items-center px-6 py-12">
            <EmptyState
              icon={<SendIcon className="size-5" />}
              title="No response yet"
              description="Compose a request and press Send. Response bodies and headers stay in memory and are not stored."
            />
          </div>
        )}

        {sendState.phase === "sending" && (
          <div role="status" className="flex items-center gap-3 px-4 py-6">
            <Spinner className="size-4 text-accent-strong" />
            <div>
              <p className="text-sm font-medium text-ink">
                Sending request…
              </p>
              <p className="mt-0.5 text-xs text-muted">
                The extension background worker is waiting for the
                server.
              </p>
            </div>
          </div>
        )}

        {sendState.phase === "error" && (
          <div role="alert" className="flex items-start gap-3 px-4 py-5">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {sendState.error.message}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-faint">
                Code: {sendState.error.code}
              </p>
            </div>
          </div>
        )}

        {sendState.phase === "response" && (
          <ResponseInspector
            key={sendState.requestId}
            data={sendState.data}
          />
        )}
      </Card>

      <p className="text-[11px] leading-5 text-faint">
        Sending asks Chrome for access to the request origin. Request
        drafts and responses stay in memory and are not stored.
      </p>
    </section>
  );
}
