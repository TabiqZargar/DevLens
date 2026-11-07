import { APP_VERSION } from "../../shared/constants";
import type { NetworkExportBody } from "./network-content";
import { getNetworkContentMimeType } from "./network-content";
import type { NetworkEntry } from "./network-model";

export interface NetworkHarHeader {
  name: string;
  value: string;
}

export interface NetworkHarCookie {
  name: string;
  value: string;
}

export interface NetworkHarQueryString {
  name: string;
  value: string;
}

export interface NetworkHarPostDataParam {
  name: string;
  value: string;
  fileName?: string;
  contentType?: string;
}

export interface NetworkHarPostData {
  mimeType: string;
  text?: string;
  params?: NetworkHarPostDataParam[];
}

export interface NetworkHarContent {
  size: number;
  mimeType: string;
  text?: string;
  encoding?: string;
  comment?: string;
}

export interface NetworkHarRequest {
  method: string;
  url: string;
  httpVersion: string;
  cookies: NetworkHarCookie[];
  headers: NetworkHarHeader[];
  queryString: NetworkHarQueryString[];
  postData?: NetworkHarPostData;
  headersSize: number;
  bodySize: number;
}

export interface NetworkHarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  cookies: NetworkHarCookie[];
  headers: NetworkHarHeader[];
  content: NetworkHarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
}

export interface NetworkHarTimings {
  send: number;
  wait: number;
  receive: number;
}

export interface NetworkHarEntry {
  startedDateTime: string;
  time: number;
  request: NetworkHarRequest;
  response: NetworkHarResponse;
  cache: Record<string, never>;
  timings: NetworkHarTimings;
  comment?: string;
}

export interface NetworkHarLog {
  log: {
    version: "1.2";
    creator: {
      name: string;
      version: string;
    };
    entries: NetworkHarEntry[];
  };
}

export interface NetworkHarExportOptions {
  entries: readonly NetworkEntry[];
  loadedBodies?: ReadonlyMap<string, NetworkExportBody>;
  exportedAt?: Date;
}

function toIsoDate(value: string | null): string | null {
  if (value === null || value.length === 0) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
}

function getHeaderValue(
  headers: readonly NetworkHarHeader[],
  name: string,
): string | null {
  const target = name.toLowerCase();

  for (const header of headers) {
    if (header.name.toLowerCase() === target) {
      return header.value;
    }
  }

  return null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function toHeaders(
  headers: readonly { name: string; value: string }[],
): NetworkHarHeader[] {
  return headers.map(({ name, value }) => ({ name, value }));
}

function toQueryString(
  params: readonly { name: string; value: string }[],
): NetworkHarQueryString[] {
  return params.map(({ name, value }) => ({ name, value }));
}

function toPostData(entry: NetworkEntry): NetworkHarPostData | undefined {
  const postData = entry.postData;

  if (postData === null) return undefined;

  const result: NetworkHarPostData = {
    mimeType: postData.mimeType,
  };

  if (postData.text !== null) {
    result.text = postData.text;
  }

  if (postData.params.length > 0) {
    result.params = postData.params.map((param) => {
      const next: NetworkHarPostDataParam = {
        name: param.name,
        value: param.value,
      };

      if (param.fileName !== null) next.fileName = param.fileName;
      if (param.contentType !== null) {
        next.contentType = param.contentType;
      }

      return next;
    });
  }

  return result;
}

function toHarEntry(
  entry: NetworkEntry,
  loadedBody: NetworkExportBody | undefined,
  exportedAt: Date,
): NetworkHarEntry {
  const startedDateTime =
    toIsoDate(entry.startedAt) ?? exportedAt.toISOString();
  const responseHeaders = toHeaders(entry.responseHeaders);
  const mimeType = getNetworkContentMimeType(entry.responseHeaders);
  const contentSize =
    entry.responseSizeBytes ??
    (loadedBody === undefined ? -1 : byteLength(loadedBody.text));

  const content: NetworkHarContent = {
    size: contentSize,
    mimeType,
  };

  if (loadedBody !== undefined) {
    content.text = loadedBody.text;

    if (loadedBody.truncated) {
      content.comment =
        "Response text was truncated to the DevLens export limit.";
    }
  }

  const harEntry: NetworkHarEntry = {
    startedDateTime,
    time: entry.durationMs ?? -1,
    request: {
      method: entry.method,
      url: entry.url,
      httpVersion: "",
      cookies: [],
      headers: toHeaders(entry.requestHeaders),
      queryString: toQueryString(entry.queryParams),
      headersSize: -1,
      bodySize: entry.requestSizeBytes ?? -1,
    },
    response: {
      status: entry.status ?? 0,
      statusText: entry.statusText,
      httpVersion: "",
      cookies: [],
      headers: responseHeaders,
      content,
      redirectURL:
        getHeaderValue(responseHeaders, "location") ?? "",
      headersSize: -1,
      bodySize: entry.responseSizeBytes ?? -1,
    },
    cache: {},
    timings: {
      send: -1,
      wait: -1,
      receive: -1,
    },
  };

  const postData = toPostData(entry);

  if (postData !== undefined) {
    harEntry.request.postData = postData;
  }

  if (toIsoDate(entry.startedAt) === null) {
    harEntry.comment =
      "Original request start time was unavailable; export time was used.";
  }

  return harEntry;
}

export function createNetworkHar({
  entries,
  loadedBodies = new Map<string, NetworkExportBody>(),
  exportedAt = new Date(),
}: NetworkHarExportOptions): NetworkHarLog {
  return {
    log: {
      version: "1.2",
      creator: {
        name: "DevLens",
        version: APP_VERSION,
      },
      entries: entries.map((entry) =>
        toHarEntry(entry, loadedBodies.get(entry.id), exportedAt),
      ),
    },
  };
}

export function serializeNetworkHar(har: NetworkHarLog): string {
  return JSON.stringify(har, null, 2);
}

export function createNetworkHarFilename(date: Date = new Date()): string {
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `devlens-network-${stamp}.har`;
}
