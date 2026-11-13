import {
  Badge,
  Card,
  CheckIcon,
  NetworkIcon,
  PageHeader,
} from "../../components";
import { getModuleDefinition } from "../../shared/modules";

const module = getModuleDefinition("network");

const PANEL_FEATURES = [
  "Live capture with pause and clear controls.",
  "Search by URL, host, or method; filter by status and resource type.",
  "Request overview, headers, payload, timing, and initiator.",
  "On-demand response previews, Copy as cURL, and HAR export.",
] as const;

export function NetworkScreen() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description="Capture and inspect requests from the dedicated DevTools panel, scoped to the page you are already inspecting."
        actions={<Badge variant="accent">DevTools surface</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-base text-muted">
              <NetworkIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                Open the DevLens Network panel
              </h2>
              <p className="mt-1 text-[13px] leading-6 text-muted">
                The panel observes the inspected tab without asking for
                access to every site.
              </p>
            </div>
          </div>

          <ol className="mt-4 grid gap-2.5 border-t border-line pt-4">
            {[
              "Open DevTools with F12 or Ctrl/Cmd + Shift + I.",
              "Choose DevLens Network from the panel tabs.",
              "Interact with the page while capture is running.",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded border border-line bg-base font-mono text-[10px] text-muted">
                  {index + 1}
                </span>
                <span className="pt-0.5 text-[13px] leading-5 text-muted">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="flex flex-col p-4">
          <h2 className="text-sm font-semibold text-ink">
            Available in the panel
          </h2>
          <ul className="mt-3 grid gap-2">
            {PANEL_FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-xs leading-5 text-muted"
              >
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="mt-auto border-t border-line pt-4 text-[11px] leading-5 text-faint">
            Captures and loaded response bodies stay in memory for the
            current DevTools session.
          </p>
        </Card>
      </div>
    </section>
  );
}
