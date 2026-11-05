import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CheckIcon,
  cn,
  PageHeader,
  SendIcon,
  TrashIcon,
} from "../../components";
import { getModuleDefinition } from "../../shared/modules";
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

const module = getModuleDefinition("api");

type RequestSection = "params" | "headers" | "body";

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
  const [notice, setNotice] = useState<string | null>(null);

  const urlValidation = validateRequestUrl(draft.url);
  const urlError =
    draft.url.trim().length > 0 && !urlValidation.ok
      ? urlValidation.message
      : null;
  const urlHelp =
    draft.url.trim().length === 0
      ? "Use an absolute http:// or https:// URL. Requests are not sent in this stage."
      : urlValidation.ok
        ? "URL format valid. Requests are not sent in this stage."
        : null;

  const counts: Record<RequestSection, number> = {
    params: countEnabledRows(draft.params),
    headers: countEnabledRows(draft.headers),
    body: draft.body.content.trim().length > 0 ? 1 : 0,
  };

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
    setDraft(createRequestDraft());
    setActiveSection("params");
    setNotice("Reset the request editor. Nothing is sent or stored.");
  }

  return (
    <section className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description="Compose a request with a method, URL, query parameters, headers, and a body. Everything stays in memory on this screen."
        actions={<Badge variant="accent">Local only</Badge>}
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
            disabled
            title="Sending arrives in Stage 3B"
            aria-describedby="api-send-note"
          >
            <SendIcon className="size-3.5" />
            Send
          </Button>
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={isDraftEmpty(draft)}
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
          <Badge variant="outline">Editor only</Badge>
        </div>
        <span id="api-send-note" className="sr-only">
          Requests are not sent in this stage.
        </span>
      </Card>

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3"
        >
          <CheckIcon className="size-4 shrink-0 text-accent-strong" />
          <p className="text-sm font-medium text-ink">{notice}</p>
        </div>
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
            description="Enabled rows with a key are appended to the URL when request sending lands."
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
            description="Enabled rows with a key are kept in memory for this editor only."
            addLabel="Add header"
            rows={draft.headers}
            keyPlaceholder="Header-Name"
            valuePlaceholder="value"
            fieldLabel="Header"
            itemLabel="header"
            emptyTitle="No request headers"
            emptyDescription="Add a header to compose the request. Values are never stored or transmitted in this stage."
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
                memory on this screen.
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

      <p className="text-[11px] leading-5 text-faint">
        Stage 3A is an editor only. It does not send requests, request
        host permissions, inspect responses, or store collections.
      </p>
    </section>
  );
}
