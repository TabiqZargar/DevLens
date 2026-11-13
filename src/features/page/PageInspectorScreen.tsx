import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertIcon,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  LockIcon,
  PageHeader,
  ScanIcon,
  Spinner,
  Tabs,
} from "../../components";
import { inspectPageTab } from "../../services/page-inspection";
import { getModuleDefinition } from "../../shared/modules";
import type {
  PageAccessibilityFinding,
  PageHeadingLevel,
  PageInspectionError,
  PageInspectionResult,
} from "./page-inspection";

const module = getModuleDefinition("page");

type InspectorTab =
  | "overview"
  | "structure"
  | "links"
  | "images"
  | "forms"
  | "accessibility";

type InspectionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: PageInspectionResult }
  | { status: "error"; error: PageInspectionError };

const TABS: readonly { id: InspectorTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "structure", label: "Structure" },
  { id: "links", label: "Links" },
  { id: "images", label: "Images" },
  { id: "forms", label: "Forms" },
  { id: "accessibility", label: "Accessibility" },
];

function readTargetTabId(): number | null {
  if (typeof window === "undefined") return null;

  const search = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.split("?")[1] ?? "";
  const raw =
    search.get("targetTabId") ??
    new URLSearchParams(hashQuery).get("targetTabId");

  if (!raw) return null;

  const value = Number(raw);

  return Number.isInteger(value) && value >= 0 ? value : null;
}

function tabCount(
  id: InspectorTab,
  result: PageInspectionResult,
): number | null {
  switch (id) {
    case "overview":
      return null;
    case "structure":
      return result.headings.total;
    case "links":
      return result.links.total;
    case "images":
      return result.images.total;
    case "forms":
      return result.forms.total;
    case "accessibility":
      return result.accessibility.findings.length;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

function textOrFallback(value: string | null, fallback: string): string {
  return value !== null && value.length > 0 ? value : fallback;
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-all text-sm leading-6 text-ink",
          mono && "font-mono text-xs leading-5",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function HeadingLevelBadge({ level }: { level: PageHeadingLevel }) {
  return (
    <Badge variant="outline" className="shrink-0 font-mono">
      h{level}
    </Badge>
  );
}

function CountLine({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="text-xs leading-5 text-faint">{children}</p>
  );
}

function TruncationNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs leading-5 text-warning">
      {children}
    </p>
  );
}

function EmptySection({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-line bg-base/40 px-3.5 py-2.5 text-[13px] text-muted">
      {children}
    </p>
  );
}

function findingTone(
  severity: PageAccessibilityFinding["severity"],
): "warning" | "outline" {
  return severity === "warning" ? "warning" : "outline";
}

function OverviewPanel({ result }: { result: PageInspectionResult }) {
  const { overview } = result;

  return (
    <div className="space-y-4">
      <dl>
        <DetailRow label="Title" value={textOrFallback(overview.title, "No title")} />
        <DetailRow label="URL" value={textOrFallback(overview.url, "Unavailable")} mono />
        <DetailRow
          label="Description"
          value={textOrFallback(overview.metaDescription, "No meta description")}
        />
        <DetailRow
          label="Canonical"
          value={textOrFallback(overview.canonicalUrl, "No canonical URL")}
          mono
        />
        <DetailRow
          label="Language"
          value={textOrFallback(overview.language, "Not declared")}
        />
        <DetailRow
          label="Viewport"
          value={textOrFallback(overview.viewport, "Not declared")}
          mono
        />
        <DetailRow label="Captured" value={formatDate(result.capturedAt)} />
      </dl>
      <p className="text-xs leading-5 text-faint">
        This snapshot exists only in this workspace tab and is never
        persisted or sent anywhere.
      </p>
    </div>
  );
}

function StructurePanel({ result }: { result: PageInspectionResult }) {
  const { headings } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={headings.missingH1 ? "warning" : "success"}>
          {headings.missingH1 ? "No H1" : `${headings.h1Count} H1`}
        </Badge>
        <CountLine>
          {headings.total} heading{headings.total === 1 ? "" : "s"} in the
          inspected sample.
        </CountLine>
      </div>

      {headings.jumps.length > 0 && (
        <div className="rounded-md border border-line bg-base/40 p-4">
          <h3 className="text-xs font-medium text-ink">Heading level jumps</h3>
          <ul className="mt-2 space-y-1.5">
            {headings.jumps.map((jump, index) => (
              <li
                key={`${jump.from}-${jump.to}-${index}`}
                className="text-xs leading-5 text-muted"
              >
                h{jump.from} → h{jump.to}
                {jump.text.length > 0 ? ` at “${jump.text}”` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {headings.items.length === 0 ? (
        <EmptySection>No headings were found.</EmptySection>
      ) : (
        <ol className="space-y-1.5">
          {headings.items.map((heading, index) => (
            <li
              key={`${heading.level}-${index}`}
              className="flex items-start gap-3 rounded-md border border-line bg-base/40 px-3 py-2"
            >
              <HeadingLevelBadge level={heading.level} />
              <span className="min-w-0 break-words text-sm leading-6 text-ink">
                {heading.text.length > 0
                  ? heading.text
                  : "(empty heading)"}
              </span>
            </li>
          ))}
        </ol>
      )}

      {headings.truncated && (
        <TruncationNote>
          Showing the first {headings.items.length} of {headings.total}{" "}
          headings. DevLens bounds large DOM collections.
        </TruncationNote>
      )}
    </div>
  );
}

function LinksPanel({ result }: { result: PageInspectionResult }) {
  const { links } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={links.emptyTextCount > 0 ? "warning" : "success"}>
          {links.emptyTextCount} without text
        </Badge>
        <CountLine>
          {links.total} link{links.total === 1 ? "" : "s"} in the inspected
          sample.
        </CountLine>
      </div>

      {links.items.length === 0 ? (
        <EmptySection>No links were found.</EmptySection>
      ) : (
        <ul className="space-y-2">
          {links.items.map((link, index) => (
            <li
              key={`${link.href ?? "no-href"}-${index}`}
              className="rounded-md border border-line bg-base/40 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 break-words text-sm leading-6",
                    link.emptyText ? "text-warning" : "text-ink",
                  )}
                >
                  {link.emptyText ? "(no accessible text)" : link.text}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {link.opensInNewTab && (
                    <Badge variant="outline">New tab</Badge>
                  )}
                  {link.target && (
                    <Badge variant="neutral" className="font-mono normal-case tracking-normal">
                      target={link.target}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] leading-5 text-faint">
                {link.href ?? "No href"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {links.truncated && (
        <TruncationNote>
          Showing the first {links.items.length} of {links.total} links.
        </TruncationNote>
      )}
    </div>
  );
}

function ImagesPanel({ result }: { result: PageInspectionResult }) {
  const { images } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={images.missingAltCount > 0 ? "warning" : "success"}>
          {images.missingAltCount} missing alt
        </Badge>
        <CountLine>
          {images.total} image{images.total === 1 ? "" : "s"} in the inspected
          sample.
        </CountLine>
      </div>

      {images.items.length === 0 ? (
        <EmptySection>No images were found.</EmptySection>
      ) : (
        <ul className="space-y-2">
          {images.items.map((image, index) => (
            <li
              key={`${image.src}-${index}`}
              className="rounded-md border border-line bg-base/40 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-all font-mono text-[11px] leading-5 text-ink">
                  {image.src.length > 0 ? image.src : "No src"}
                </p>
                <Badge
                  variant={image.missingAlt ? "warning" : "success"}
                  className="shrink-0"
                >
                  {image.missingAlt ? "Missing alt" : "Alt present"}
                </Badge>
              </div>
              <p className="mt-1 break-words text-xs leading-5 text-muted">
                Alt:{" "}
                {image.alt === null
                  ? "not set"
                  : image.alt.length > 0
                    ? image.alt
                    : "(empty / decorative)"}
              </p>
              <p className="mt-1 font-mono text-[10px] leading-5 text-faint">
                Natural {formatDimensions(image.naturalWidth, image.naturalHeight)}
                {" · "}
                Display {formatDimensions(image.displayWidth, image.displayHeight)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {images.truncated && (
        <TruncationNote>
          Showing the first {images.items.length} of {images.total} images.
        </TruncationNote>
      )}
    </div>
  );
}

function FormsPanel({ result }: { result: PageInspectionResult }) {
  const { forms } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={forms.unlabeledControlCount > 0 ? "warning" : "success"}>
          {forms.unlabeledControlCount} unlabeled
        </Badge>
        <CountLine>
          {forms.total} form{forms.total === 1 ? "" : "s"},{" "}
          {forms.controlCount} control{forms.controlCount === 1 ? "" : "s"}.
        </CountLine>
      </div>

      <p className="rounded-lg border border-cyan/25 bg-cyan/[0.05] px-3 py-2 text-xs leading-5 text-cyan">
        DevLens reports field names, types, and labels only. Entered values,
        passwords, and file selections are never read.
      </p>

      {forms.items.length === 0 ? (
        <EmptySection>No forms were found.</EmptySection>
      ) : (
        <ul className="space-y-3">
          {forms.items.map((form, index) => (
            <li
              key={`${form.action}-${index}`}
              className="rounded-md border border-line bg-base/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent" className="font-mono normal-case tracking-normal">
                  {form.method.toUpperCase()}
                </Badge>
                <p className="min-w-0 break-all font-mono text-[11px] leading-5 text-muted">
                  {form.action.length > 0 ? form.action : "(no action)"}
                </p>
              </div>

              {form.controls.length === 0 ? (
                <p className="mt-2 text-xs leading-5 text-faint">
                  No controls were found in this form.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-[11px]">
                    <thead className="text-[9px] uppercase tracking-[0.12em] text-faint">
                      <tr>
                        <th className="pb-2 pr-3 font-medium">Control</th>
                        <th className="pb-2 pr-3 font-medium">Name</th>
                        <th className="pb-2 pr-3 font-medium">Label</th>
                        <th className="pb-2 pr-3 font-medium">Placeholder</th>
                        <th className="pb-2 font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/70 text-muted">
                      {form.controls.map((control, controlIndex) => (
                        <tr key={`${control.tag}-${control.name}-${controlIndex}`}>
                          <td className="py-2 pr-3 font-mono text-ink">
                            {control.tag}
                            {control.tag === "input" ? `:${control.type}` : ""}
                          </td>
                          <td className="py-2 pr-3 break-all font-mono">
                            {control.name.length > 0 ? control.name : "—"}
                          </td>
                          <td className="py-2 pr-3 break-words">
                            {control.label ?? (
                              <span className="text-warning">Missing</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 break-words">
                            {control.placeholder ?? "—"}
                          </td>
                          <td className="py-2">
                            <span className="flex flex-wrap gap-1">
                              {control.required && (
                                <Badge variant="outline">Required</Badge>
                              )}
                              {control.disabled && (
                                <Badge variant="neutral">Disabled</Badge>
                              )}
                              {!control.required && !control.disabled && "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {form.truncated && (
                <p className="mt-2 text-[10px] leading-5 text-warning">
                  Showing {form.controls.length} of {form.totalControls}{" "}
                  controls in this form.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {forms.truncated && (
        <TruncationNote>
          Showing the first {forms.items.length} of {forms.total} forms.
        </TruncationNote>
      )}
    </div>
  );
}

function AccessibilityPanel({ result }: { result: PageInspectionResult }) {
  const findings = result.accessibility.findings;

  return (
    <div className="space-y-4">
      {findings.length === 0 ? (
        <EmptySection>
          No findings from the built-in checks.
        </EmptySection>
      ) : (
        <ul className="space-y-2">
          {findings.map((finding, index) => (
            <li
              key={`${finding.code}-${index}`}
              className="flex items-start gap-3 rounded-md border border-line bg-base/40 p-3"
            >
              <Badge
                variant={findingTone(finding.severity)}
                className="mt-0.5 shrink-0"
              >
                {finding.severity}
              </Badge>
              <div>
                <p className="text-sm leading-6 text-ink">
                  {finding.message}
                </p>
                <p className="mt-0.5 font-mono text-[10px] leading-5 text-faint">
                  {finding.code}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-md border border-line bg-base/40 px-3 py-2 text-xs leading-5 text-muted">
        These are lightweight heuristic checks over the inspected sample.
        They are not a WCAG conformance audit or a substitute for manual
        accessibility testing.
      </p>
    </div>
  );
}

function InspectionPanel({
  tab,
  result,
}: {
  tab: InspectorTab;
  result: PageInspectionResult;
}) {
  switch (tab) {
    case "overview":
      return <OverviewPanel result={result} />;
    case "structure":
      return <StructurePanel result={result} />;
    case "links":
      return <LinksPanel result={result} />;
    case "images":
      return <ImagesPanel result={result} />;
    case "forms":
      return <FormsPanel result={result} />;
    case "accessibility":
      return <AccessibilityPanel result={result} />;
  }
}

function BoundaryCard() {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-base text-muted">
          <LockIcon className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            Inspection boundary
          </h2>
          <ul className="mt-3 grid gap-2 text-xs leading-5 text-muted">
            <li>
              The page is read only after you press Inspect, and only once
              per click. There is no background monitoring.
            </li>
            <li>
              DevLens never reads form values, passwords, cookies, storage,
              or authentication data, and never changes the page.
            </li>
            <li>
              Snapshot data stays in this workspace tab. It is not persisted,
              logged, or sent to Local AI or any other service.
            </li>
            <li>
              Chrome grants temporary access to the tab captured when the
              DevLens popup was opened. Restricted browser pages cannot be
              inspected.
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function PageInspectorScreen() {
  const [targetTabId] = useState<number | null>(readTargetTabId);
  const [state, setState] = useState<InspectionState>({
    status: "idle",
  });
  const [tab, setTab] = useState<InspectorTab>("overview");
  const mountedRef = useRef(true);
  const tokenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
    };
  }, []);

  async function handleInspect() {
    if (state.status === "loading") return;

    if (targetTabId === null) {
      setState({
        status: "error",
        error: {
          code: "no-target",
          message:
            "Open the DevLens toolbar popup while viewing the page you want to inspect, then choose Page Inspector.",
        },
      });
      return;
    }

    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setTab("overview");
    setState({ status: "loading" });

    let response;

    try {
      response = await inspectPageTab(targetTabId);
    } catch {
      response = {
        type: "devlens:page-inspect" as const,
        ok: false as const,
        error: {
          code: "inspection-failed" as const,
          message: "DevLens could not inspect this page.",
        },
      };
    }

    if (!mountedRef.current || token !== tokenRef.current) return;

    if (response.ok) {
      setState({ status: "ready", result: response.data });
    } else {
      setState({ status: "error", error: response.error });
    }
  }

  function handleClear() {
    if (state.status === "loading") return;
    tokenRef.current += 1;
    setTab("overview");
    setState({ status: "idle" });
  }

  const ready = state.status === "ready";
  const loading = state.status === "loading";

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description="Take a read-only snapshot of the page you opened DevLens from: metadata, structure, links, images, forms, and lightweight accessibility signals."
        actions={
          <Badge variant="accent">Read-only</Badge>
        }
      />

      {ready ? (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {textOrFallback(state.result.overview.title, "Untitled page")}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-faint">
              {state.result.overview.url}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleInspect()}
              disabled={loading}
            >
              {loading ? <Spinner /> : <ScanIcon className="size-3.5" />}
              {loading ? "Inspecting…" : "Inspect again"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              disabled={loading}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {!ready && targetTabId === null ? (
        <Card className="flex flex-col items-center p-8">
          <EmptyState
            icon={<ScanIcon className="size-5" />}
            title="Open DevLens on the page you want to inspect"
            description="Use the DevLens toolbar popup while viewing an HTTP(S) page, then choose Page Inspector. This workspace has no captured target tab yet."
          />
        </Card>
      ) : !ready ? (
        <Card className="p-4">
          {loading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3"
            >
              <Spinner />
              <div>
                <p className="text-sm font-medium text-ink">
                  Reading the page snapshot…
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  DevLens is collecting structure and metadata only. Form
                  values are never read.
                </p>
              </div>
            </div>
          ) : state.status === "error" ? (
            <div role="alert" className="flex items-start gap-3">
              <AlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {state.error.message}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                  {state.error.code}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => void handleInspect()}
                >
                  <ScanIcon className="size-3.5" />
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-base text-accent-strong">
                  <ScanIcon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">
                    Target tab captured
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    DevLens has not read the page yet. The snapshot is
                    created only when you press Inspect.
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                className="shrink-0"
                onClick={() => void handleInspect()}
              >
                <ScanIcon className="size-4" />
                Inspect page
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      {ready ? (
        <Card className="p-4">
          <Tabs
            items={TABS.map((item) => {
              const count = tabCount(item.id, state.result);

              return {
                id: item.id,
                label: (
                  <>
                    {item.label}
                    {count !== null && (
                      <span className="ml-1.5 font-mono text-[10px] text-faint">
                        {count}
                      </span>
                    )}
                  </>
                ),
              };
            })}
            value={tab}
            onChange={setTab}
            label="Page inspection sections"
            idPrefix="page-inspection-tab"
            panelId="page-inspection-panel"
            className="lens-scrollbar overflow-x-auto border-b border-line pb-2"
          />
          <div
            role="tabpanel"
            id="page-inspection-panel"
            aria-labelledby={`page-inspection-tab-${tab}`}
            className="pt-4"
          >
            <InspectionPanel tab={tab} result={state.result} />
          </div>
        </Card>
      ) : null}

      <BoundaryCard />
    </section>
  );
}
