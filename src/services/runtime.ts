import { APP_VERSION } from "../shared/constants";
import type { ModuleId } from "../shared/modules";

export function isExtensionRuntime(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime !== "undefined" &&
    typeof chrome.runtime.id === "string"
  );
}

export async function openWorkspace(moduleId: ModuleId): Promise<void> {
  const relativeUrl = `workspace.html#/${moduleId}`;

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
