export const NETWORK_RESOURCE_TYPES = [
  "document",
  "stylesheet",
  "image",
  "media",
  "font",
  "script",
  "texttrack",
  "xhr",
  "fetch",
  "prefetch",
  "eventsource",
  "websocket",
  "webtransport",
  "wasm",
  "manifest",
  "signed-exchange",
  "ping",
  "csp-violation-report",
  "other",
  "preflight",
  "sm-script",
  "sm-stylesheet",
  "webbundle",
] as const;

export type NetworkResourceType = (typeof NETWORK_RESOURCE_TYPES)[number];

export const NETWORK_STATUS_CLASSES = [
  "success",
  "redirect",
  "client-error",
  "server-error",
  "failed",
] as const;

export type NetworkStatusClass = (typeof NETWORK_STATUS_CLASSES)[number];

export interface NetworkHeader {
  name: string;
  value: string;
}

export interface NetworkQueryParam {
  name: string;
  value: string;
}

export interface NetworkPostDataParam {
  name: string;
  value: string;
  fileName: string | null;
  contentType: string | null;
}

export interface NetworkPostData {
  mimeType: string;
  text: string | null;
  params: NetworkPostDataParam[];
}

export interface NetworkInitiatorFrame {
  functionName: string | null;
  url: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
}

export interface NetworkInitiator {
  type: string | null;
  url: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  frames: NetworkInitiatorFrame[];
}

export interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  host: string;
  status: number | null;
  statusText: string;
  statusClass: NetworkStatusClass;
  resourceType: NetworkResourceType;
  startedAt: string | null;
  durationMs: number | null;
  requestSizeBytes: number | null;
  responseSizeBytes: number | null;
  requestHeaders: NetworkHeader[];
  responseHeaders: NetworkHeader[];
  queryParams: NetworkQueryParam[];
  postData: NetworkPostData | null;
  initiator: NetworkInitiator | null;
  hasResponseContent: boolean;
}

export interface NetworkFilters {
  search?: string | null;
  resourceType?: NetworkResourceType | "all" | null;
  statusClass?: NetworkStatusClass | "all" | null;
}

/**
 * Entries are kept in arrival order. Once the limit is reached, the oldest
 * entry is evicted when a new request is appended.
 */
export const NETWORK_ENTRY_LIMIT = 1_000;
export const NETWORK_INITIATOR_STACK_LIMIT = 6;

const RESOURCE_TYPE_SET: ReadonlySet<string> = new Set(
  NETWORK_RESOURCE_TYPES,
);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoundedText(
  value: unknown,
  limit: number,
): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function readNonNegativeInteger(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && number >= 0 ? Math.floor(number) : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readNonNegativeNumber(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function parseHost(url: string): string {
  if (url.length === 0) return "";

  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function normalizeResourceType(value: unknown): NetworkResourceType {
  return typeof value === "string" && RESOURCE_TYPE_SET.has(value)
    ? (value as NetworkResourceType)
    : "other";
}

function normalizeHeaders(value: unknown): NetworkHeader[] {
  if (!Array.isArray(value)) return [];

  const headers: NetworkHeader[] = [];

  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;

    const name = readText(record.name).trim();
    if (name.length === 0) continue;

    headers.push({
      name,
      value: readText(record.value),
    });
  }

  return headers;
}

function normalizeQueryParams(
  value: unknown,
  url: string,
): NetworkQueryParam[] {
  if (Array.isArray(value)) {
    const params: NetworkQueryParam[] = [];

    for (const item of value) {
      const record = asRecord(item);
      if (!record) continue;

      const name = readText(record.name);
      if (name.length === 0) continue;

      params.push({
        name,
        value: readText(record.value),
      });
    }

    if (params.length > 0) return params;
  }

  if (url.length === 0) return [];

  try {
    return Array.from(
      new URL(url).searchParams,
      ([name, paramValue]) => ({
        name,
        value: paramValue,
      }),
    );
  } catch {
    return [];
  }
}

function normalizePostDataParams(value: unknown): NetworkPostDataParam[] {
  if (!Array.isArray(value)) return [];

  const params: NetworkPostDataParam[] = [];

  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;

    const name = readText(record.name);
    if (name.length === 0) continue;

    params.push({
      name,
      value: readText(record.value),
      fileName: readNonEmptyText(record.fileName),
      contentType: readNonEmptyText(record.contentType),
    });
  }

  return params;
}

function normalizePostData(value: unknown): NetworkPostData | null {
  const record = asRecord(value);
  if (!record) return null;

  const mimeType = readText(record.mimeType);
  const text = readNullableText(record.text);
  const params = normalizePostDataParams(record.params);

  if (mimeType.length === 0 && text === null && params.length === 0) {
    return null;
  }

  return { mimeType, text, params };
}

function normalizeInitiatorFrame(
  value: unknown,
): NetworkInitiatorFrame | null {
  const record = asRecord(value);
  if (!record) return null;

  const frame: NetworkInitiatorFrame = {
    functionName: readBoundedText(record.functionName, 256),
    url: readBoundedText(record.url, 512),
    lineNumber: readNonNegativeInteger(record.lineNumber),
    columnNumber: readNonNegativeInteger(record.columnNumber),
  };

  if (
    frame.functionName === null &&
    frame.url === null &&
    frame.lineNumber === null &&
    frame.columnNumber === null
  ) {
    return null;
  }

  return frame;
}

function normalizeInitiator(value: unknown): NetworkInitiator | null {
  const record = asRecord(value);
  if (!record) return null;

  const stack = asRecord(record.stack);
  const rawFrames = stack?.callFrames;
  const frames: NetworkInitiatorFrame[] = [];

  if (Array.isArray(rawFrames)) {
    for (const item of rawFrames) {
      if (frames.length >= NETWORK_INITIATOR_STACK_LIMIT) break;

      const frame = normalizeInitiatorFrame(item);
      if (frame) frames.push(frame);
    }
  }

  const initiator: NetworkInitiator = {
    type: readBoundedText(record.type, 64),
    url: readBoundedText(record.url, 512),
    lineNumber: readNonNegativeInteger(record.lineNumber),
    columnNumber: readNonNegativeInteger(record.columnNumber),
    frames,
  };

  if (
    initiator.type === null &&
    initiator.url === null &&
    initiator.lineNumber === null &&
    initiator.columnNumber === null &&
    initiator.frames.length === 0
  ) {
    return null;
  }

  return initiator;
}

function hasResponseContentAccessor(entry: HARFormatEntry): boolean {
  const record = asRecord(entry);
  return record !== null && typeof record.getContent === "function";
}

export function getNetworkStatusClass(
  status: number | null,
): NetworkStatusClass {
  if (status === null || !Number.isFinite(status) || status <= 0) {
    return "failed";
  }

  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "redirect";
  if (status >= 400 && status < 500) return "client-error";
  if (status >= 500 && status < 600) return "server-error";

  return "failed";
}

function createNetworkEntryId(fields: {
  startedAt: string | null;
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  requestSizeBytes: number | null;
  responseSizeBytes: number | null;
}): string {
  return JSON.stringify([
    fields.startedAt,
    fields.method,
    fields.url,
    fields.status,
    fields.durationMs,
    fields.requestSizeBytes,
    fields.responseSizeBytes,
  ]);
}

export function normalizeNetworkEntry(
  entry: HARFormatEntry,
): NetworkEntry {
  const record = asRecord(entry) ?? {};
  const request = asRecord(record.request) ?? {};
  const response = asRecord(record.response) ?? {};

  const method = readText(request.method).trim().toUpperCase();
  const url = readText(request.url);
  const status = readNumber(response.status);
  const startedAt = readNonEmptyText(record.startedDateTime);
  const durationMs = readNonNegativeNumber(record.time);
  const requestSizeBytes = readNonNegativeNumber(request.bodySize);
  const responseSizeBytes = readNonNegativeNumber(response.bodySize);

  return {
    id: createNetworkEntryId({
      startedAt,
      method,
      url,
      status,
      durationMs,
      requestSizeBytes,
      responseSizeBytes,
    }),
    method,
    url,
    host: parseHost(url),
    status,
    statusText: readText(response.statusText),
    statusClass: getNetworkStatusClass(status),
    resourceType: normalizeResourceType(record._resourceType),
    startedAt,
    durationMs,
    requestSizeBytes,
    responseSizeBytes,
    requestHeaders: normalizeHeaders(request.headers),
    responseHeaders: normalizeHeaders(response.headers),
    queryParams: normalizeQueryParams(request.queryString, url),
    postData: normalizePostData(request.postData),
    initiator: normalizeInitiator(record._initiator),
    hasResponseContent: hasResponseContentAccessor(entry),
  };
}

export function filterNetworkEntries(
  entries: readonly NetworkEntry[],
  filters: NetworkFilters = {},
): NetworkEntry[] {
  const search = (filters.search ?? "").trim().toLowerCase();
  const resourceType = filters.resourceType ?? "all";
  const statusClass = filters.statusClass ?? "all";

  return entries.filter((entry) => {
    if (
      resourceType !== "all" &&
      entry.resourceType !== resourceType
    ) {
      return false;
    }

    if (statusClass !== "all" && entry.statusClass !== statusClass) {
      return false;
    }

    if (search.length === 0) return true;

    return (
      entry.url.toLowerCase().includes(search) ||
      entry.host.toLowerCase().includes(search) ||
      entry.method.toLowerCase().includes(search)
    );
  });
}

export function appendNetworkEntry(
  entries: readonly NetworkEntry[],
  entry: NetworkEntry,
  limit: number = NETWORK_ENTRY_LIMIT,
): NetworkEntry[] {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : NETWORK_ENTRY_LIMIT;

  if (boundedLimit === 0) return [];

  const isDuplicate = entries.some(
    (existing) => existing.id === entry.id,
  );
  const next = isDuplicate ? [...entries] : [...entries, entry];

  return next.length > boundedLimit
    ? next.slice(next.length - boundedLimit)
    : next;
}
