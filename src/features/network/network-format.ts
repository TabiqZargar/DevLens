import type { NetworkResourceType } from "./network-model";

const RESOURCE_TYPE_LABELS: Record<NetworkResourceType, string> = {
  document: "Document",
  stylesheet: "Stylesheet",
  image: "Image",
  media: "Media",
  font: "Font",
  script: "Script",
  texttrack: "Text track",
  xhr: "XHR",
  fetch: "Fetch",
  prefetch: "Prefetch",
  eventsource: "Event source",
  websocket: "WebSocket",
  webtransport: "Web transport",
  wasm: "Wasm",
  manifest: "Manifest",
  "signed-exchange": "Signed exchange",
  ping: "Ping",
  "csp-violation-report": "CSP report",
  other: "Other",
  preflight: "Preflight",
  "sm-script": "SM script",
  "sm-stylesheet": "SM stylesheet",
  webbundle: "Web bundle",
};

export function formatNetworkResourceType(
  resourceType: NetworkResourceType,
): string {
  return RESOURCE_TYPE_LABELS[resourceType];
}

export function formatNetworkDuration(
  durationMs: number | null,
): string {
  if (durationMs === null) return "—";
  if (durationMs < 1) return `${Math.round(durationMs * 1_000)} µs`;
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;

  return `${(durationMs / 1_000).toFixed(2)} s`;
}

export function formatNetworkBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1_024) return `${Math.round(bytes)} B`;

  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1_024;
  let unitIndex = 0;

  while (value >= 1_024 && unitIndex < units.length - 1) {
    value /= 1_024;
    unitIndex += 1;
  }

  const formatted = value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
  const unit = units[unitIndex] ?? "KB";
  return `${formatted} ${unit}`;
}

export function formatNetworkStartTime(
  startedAt: string | null,
): string {
  if (startedAt === null) return "Not available";

  const date = new Date(startedAt);

  if (Number.isNaN(date.getTime())) return startedAt;

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function formatNetworkPath(url: string): string {
  if (url.length === 0) return "—";

  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path.length > 0 ? path : "/";
  } catch {
    return url;
  }
}
