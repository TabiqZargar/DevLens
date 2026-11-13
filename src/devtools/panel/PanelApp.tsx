import { useEffect, useState } from "react";
import { LogoMark } from "../../components";
import {
  createNetworkCapture,
  type NetworkCapture,
  type NetworkCaptureState,
} from "../../features/network/network-capture";
import { NetworkInspector } from "../../features/network/NetworkInspector";
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

export interface PanelAppProps {
  capture?: NetworkCapture;
}

export function PanelApp({ capture: injectedCapture }: PanelAppProps = {}) {
  const tabId = useInspectedTabId();
  const [capture] = useState(
    () => injectedCapture ?? createNetworkCapture(),
  );
  const [captureState, setCaptureState] = useState<NetworkCaptureState>(
    () => capture.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = capture.subscribe(setCaptureState);
    capture.start();

    return () => {
      unsubscribe();
      capture.stop();
    };
  }, [capture]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-base px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark className="size-7" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-ink">
              Network Inspector
            </div>
            <div className="text-[9px] uppercase tracking-[0.12em] text-faint">
              DevLens
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-faint" />
            {tabId === null ? "No inspected tab" : `Tab ${tabId}`}
          </span>
          <span>v{APP_VERSION}</span>
        </div>
      </header>

      <NetworkInspector
        state={captureState}
        onPause={capture.pause}
        onResume={capture.resume}
        onClear={capture.clear}
        onLoadResponseContent={capture.loadResponseContent}
      />

      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-base px-3 text-[10px] text-faint">
        <span>DevTools · DevLens Network</span>
        <span>Local-only · In-memory</span>
      </footer>
    </div>
  );
}
