import { APP_VERSION } from "../shared/constants";
import type { ModuleId } from "../shared/modules";

export function isExtensionRuntime(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime !== "undefined" &&
    typeof chrome.runtime.id === "string"
  );
}

export interface OpenWorkspaceOptions {
  targetTabId?: number | null;
}

async function resolveTargetTabId(): Promise<number | null> {
  if (!isExtensionRuntime() || typeof chrome.tabs?.query !== "function") {
    return null;
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    return typeof tab?.id === "number" ? tab.id : null;
  } catch {
    return null;
  }
}

export async function openWorkspace(
  moduleId: ModuleId,
  options: OpenWorkspaceOptions = {},
): Promise<void> {
  const targetTabId =
    options.targetTabId !== undefined
      ? options.targetTabId
      : await resolveTargetTabId();
  const search =
    targetTabId !== null ? `?targetTabId=${targetTabId}` : "";
  const relativeUrl = `workspace.html${search}#/${moduleId}`;

  if (isExtensionRuntime() && typeof chrome.tabs?.create === "function") {
    await chrome.tabs.create({ url: chrome.runtime.getURL(relativeUrl) });
    return;
  }

  if (typeof window !== "undefined") {
    window.open(`./${relativeUrl}`, "_blank", "noopener,noreferrer");
  }
}

export function getExtensionVersion(): string {
  if (isExtensionRuntime()) {
    return chrome.runtime.getManifest().version;
  }
  return APP_VERSION;
}
