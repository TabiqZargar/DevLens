import { useEffect, useState } from "react";
import {
  ArrowRightIcon,
  Badge,
  Brand,
  Button,
  LockIcon,
  ModuleIcon,
  cn,
} from "../components";
import { sendRuntimeMessage, openWorkspace } from "../services";
import { APP_VERSION } from "../shared/constants";
import {
  MODULES,
  type ModuleDefinition,
} from "../shared/modules";
import type { PingPayload } from "../shared/messaging";

type WorkerStatus = "checking" | "connected" | "offline";

const STATUS_LABELS: Record<WorkerStatus, string> = {
  checking: "Checking",
  connected: "Connected",
  offline: "Offline",
};

const STATUS_DOTS: Record<WorkerStatus, string> = {
  checking: "bg-warning",
  connected: "bg-success",
  offline: "bg-faint",
};

function useBackgroundStatus(): WorkerStatus {
  const [status, setStatus] = useState<WorkerStatus>("checking");

  useEffect(() => {
    let active = true;

    void sendRuntimeMessage<PingPayload>({ type: "devlens:ping" }).then(
      (response) => {
        if (active) {
          setStatus(response.ok ? "connected" : "offline");
        }
      },
    );

    return () => {
      active = false;
    };
  }, []);

  return status;
}

function WorkerStatusPill({ status }: { status: WorkerStatus }) {
  return (
    <div
      title="Background service worker status"
      className="inline-flex items-center gap-1.5 rounded border border-line bg-base px-2 py-1 text-[10px] font-medium text-muted"
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOTS[status])} />
      {STATUS_LABELS[status]}
    </div>
  );
}

function ModuleCard({ module }: { module: ModuleDefinition }) {
  return (
    <button
      type="button"
      onClick={() => void openWorkspace(module.id)}
      title={module.tagline}
      className="group flex min-h-[76px] flex-col items-start gap-2 rounded-md border border-line bg-surface p-2.5 text-left transition-colors hover:border-line-strong hover:bg-raised"
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="grid size-7 place-items-center rounded border border-line bg-base text-muted transition-colors group-hover:border-line-strong group-hover:text-accent-strong">
          <ModuleIcon id={module.id} className="size-4" />
        </span>
        {module.surface === "devtools" && (
          <span className="rounded border border-line px-1 py-0.5 text-[9px] text-faint">
            DevTools
          </span>
        )}
      </span>
      <span className="mt-auto min-w-0">
        <span className="block text-[12px] font-medium leading-4 text-ink">
          {module.name}
        </span>
        <span className="mt-0.5 block text-[10px] text-faint">
          {module.milestone}
        </span>
      </span>
    </button>
  );
}

export function PopupApp() {
  const status = useBackgroundStatus();

  return (
    <div className="flex min-h-[540px] w-[380px] flex-col bg-canvas">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-base px-4 py-3">
        <Brand />
        <WorkerStatusPill status={status} />
      </header>

      <div className="flex flex-1 flex-col gap-4 bg-canvas px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-ink">
              Your API workbench
            </h1>
            <p className="mt-0.5 text-[11px] leading-4 text-muted">
              Inspect, shape, and test without leaving the browser.
            </p>
          </div>
          <Badge variant="outline">{MODULES.length} modules</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>

        <Button
          fullWidth
          variant="primary"
          className="mt-auto"
          onClick={() => void openWorkspace("json")}
        >
          Open workspace
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>

      <footer className="flex items-center justify-between border-t border-line bg-base px-4 py-2.5 text-[10px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <LockIcon className="size-3 text-cyan" />
          Local-first · v{APP_VERSION}
        </span>
        <span>Brave · Chrome · Edge</span>
      </footer>
    </div>
  );
}
