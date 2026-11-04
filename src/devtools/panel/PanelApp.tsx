import { useState } from "react";
import {
  Badge,
  EmptyState,
  LogoMark,
  NetworkIcon,
} from "../../components";
import { APP_VERSION } from "../../shared/constants";

function useInspectedTabId(): number | null {
  const [tabId] = useState<number | null>(() => {
    if (
      typeof chrome !== "undefined" &&
      typeof chrome.devtools?.inspectedWindow?.tabId === "number"
    ) {
      return chrome.devtools.inspectedWindow.tabId;
    }
    return null;
  });

  return tabId;
}

export function PanelApp() {
  const tabId = useInspectedTabId();

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-base/90 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-ink">
              Network Inspector
            </div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-faint">
              DevLens
            </div>
          </div>
          <Badge variant="warning" className="ml-1">
            Milestone 1
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-faint" />
            {tabId === null ? "No inspected tab" : `Tab ${tabId}`}
          </span>
          <span>v{APP_VERSION}</span>
        </div>
      </header>

      <div className="lens-grid flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<NetworkIcon className="size-6" />}
          title="Network capture is not active"
          description="This foundation build wires the DevTools panel and inspected-tab context. Request capture, filtering, and detail views land in Milestone 1."
        />
      </div>

      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line bg-base/80 px-3 text-[10px] text-faint">
        <span>DevTools · DevLens Network</span>
        <span>Local-only</span>
      </footer>
    </div>
  );
}
