import {
  isBodyContentType,
  isHttpMethod,
  normalizeRows,
  validateRequestUrl,
  type ApiRequestDraft,
  type BodyContentType,
  type HttpMethod,
  type NormalizedRow,
  type RequestBodyDraft,
} from "./api-request";

export const API_EXECUTION_MESSAGE = "devlens:api-execute" as const;
export const API_CANCEL_MESSAGE = "devlens:api-cancel" as const;

export const API_EXECUTION_DEFAULT_TIMEOUT_MS = 30_000;
export const API_EXECUTION_MIN_TIMEOUT_MS = 1_000;
export const API_EXECUTION_MAX_TIMEOUT_MS = 120_000;

export interface ApiExecutionRequest {
  type: typeof API_EXECUTION_MESSAGE;
  requestId: string;
  method: HttpMethod;
  url: string;
  params: NormalizedRow[];
  headers: NormalizedRow[];
  body: RequestBodyDraft;
  timeoutMs: number;
}

export type ApiExecutionErrorCode =
  | "invalid-request"
  | "not-implemented"
  | "runtime-unavailable"
  | "invalid-response"
  | "runtime-error"
  | "permission-denied"
  | "network-error"
  | "timeout"
  | "aborted"
  | "unsupported";

export interface ApiExecutionError {
  code: ApiExecutionErrorCode;
  message: string;
}

export interface ApiResponseHeader {
  name: string;
  value: string;
}

export interface ApiResponseMetadata {
  status: number;
  statusText: string;
  durationMs: number;
  contentType: string | null;
  finalUrl: string;
  headers: ApiResponseHeader[];
  body: string;
}

export type ApiExecutionResponse =
  | {
      type: typeof API_EXECUTION_MESSAGE;
      requestId: string;
      ok: true;
      data: ApiResponseMetadata;
    }
  | {
      type: typeof API_EXECUTION_MESSAGE;
      requestId: string | null;
      ok: false;
      error: ApiExecutionError;
    };

export type ApiExecutionParseResult =
  | { ok: true; request: ApiExecutionRequest }
  | {
      ok: false;
      requestId: string | null;
      error: ApiExecutionError;
    };

export interface ApiCancelRequest {
  type: typeof API_CANCEL_MESSAGE;
  requestId: string;
}

export type ApiCancelParseResult =
  | { ok: true; request: ApiCancelRequest }
  | {
      ok: false;
      requestId: string | null;
      error: ApiExecutionError;
    };

export type ApiCancelResponse =
  | {
      type: typeof API_CANCEL_MESSAGE;
      requestId: string;
      ok: true;
      data: { cancelled: boolean };
    }
  | {
      type: typeof API_CANCEL_MESSAGE;
      requestId: string | null;
      ok: false;
      error: ApiExecutionError;
    };

const API_EXECUTION_ERROR_CODES: readonly ApiExecutionErrorCode[] = [
  "invalid-request",
  "not-implemented",
  "runtime-unavailable",
  "invalid-response",
  "runtime-error",
  "permission-denied",
  "network-error",
  "timeout",
  "aborted",
  "unsupported",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readRequestId(
  record: Record<string, unknown>,
): string | null {
  const value = record.requestId;

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function invalidRequest(
  requestId: string | null,
): ApiExecutionParseResult {
  return {
    ok: false,
    requestId,
    error: {
      code: "invalid-request",
      message: "Malformed API execution request.",
    },
  };
}

function parseRows(value: unknown): NormalizedRow[] | null {
  if (!Array.isArray(value)) return null;

  const rows: NormalizedRow[] = [];

  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) return null;

    const key = record.key;
    const rowValue = record.value;

    if (
      typeof key !== "string" ||
      typeof rowValue !== "string" ||
      key.trim().length === 0
    ) {
      return null;
    }

    rows.push({ key: key.trim(), value: rowValue });
  }

  return rows;
}

function parseBody(value: unknown): RequestBodyDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const contentType = record.contentType;
  const content = record.content;

  if (
    typeof contentType !== "string" ||
    !isBodyContentType(contentType) ||
    typeof content !== "string"
  ) {
    return null;
  }

  if (contentType === "none" && content.length > 0) {
    return null;
  }

  return { contentType, content };
}

function parseTimeout(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < API_EXECUTION_MIN_TIMEOUT_MS ||
    value > API_EXECUTION_MAX_TIMEOUT_MS
  ) {
    return null;
  }

  return value;
}

export function createApiExecutionRequest(
  draft: ApiRequestDraft,
  requestId: string,
  timeoutMs: number = API_EXECUTION_DEFAULT_TIMEOUT_MS,
): ApiExecutionRequest {
  const body: RequestBodyDraft =
    draft.body.contentType === "none"
      ? { contentType: "none", content: "" }
      : {
          contentType: draft.body.contentType,
          content: draft.body.content,
        };

  return {
    type: API_EXECUTION_MESSAGE,
    requestId: requestId.trim(),
    method: draft.method,
    url: draft.url.trim(),
    params: normalizeRows(draft.params),
    headers: normalizeRows(draft.headers),
    body,
    timeoutMs,
  };
}

export function isApiExecutionMessage(
  value: unknown,
): value is { type: typeof API_EXECUTION_MESSAGE } {
  const record = asRecord(value);
  return record !== null && record.type === API_EXECUTION_MESSAGE;
}

export function parseApiExecutionRequest(
  value: unknown,
): ApiExecutionParseResult {
  const record = asRecord(value);

  if (!record || record.type !== API_EXECUTION_MESSAGE) {
    return invalidRequest(record ? readRequestId(record) : null);
  }

  const requestId = readRequestId(record);
  if (requestId === null) return invalidRequest(null);

  const method = record.method;
  if (typeof method !== "string" || !isHttpMethod(method)) {
    return invalidRequest(requestId);
  }

  const url = record.url;
  if (
    typeof url !== "string" ||
    !validateRequestUrl(url).ok
  ) {
    return invalidRequest(requestId);
  }

  const params = parseRows(record.params);
  if (!params) return invalidRequest(requestId);

  const headers = parseRows(record.headers);
  if (!headers) return invalidRequest(requestId);

  const body = parseBody(record.body);
  if (!body) return invalidRequest(requestId);

  const timeoutMs = parseTimeout(record.timeoutMs);
  if (timeoutMs === null) return invalidRequest(requestId);

  return {
    ok: true,
    request: {
      type: API_EXECUTION_MESSAGE,
      requestId,
      method,
      url: url.trim(),
      params,
      headers,
      body,
      timeoutMs,
    },
  };
}

export function isApiExecutionRequest(
  value: unknown,
): value is ApiExecutionRequest {
  return parseApiExecutionRequest(value).ok;
}

export function isApiCancelMessage(
  value: unknown,
): value is { type: typeof API_CANCEL_MESSAGE } {
  const record = asRecord(value);
  return record !== null && record.type === API_CANCEL_MESSAGE;
}

function invalidCancel(
  requestId: string | null,
): ApiCancelParseResult {
  return {
    ok: false,
    requestId,
    error: {
      code: "invalid-request",
      message: "Malformed API cancellation request.",
    },
  };
}

export function parseApiCancelRequest(
  value: unknown,
): ApiCancelParseResult {
  const record = asRecord(value);

  if (!record || record.type !== API_CANCEL_MESSAGE) {
    return invalidCancel(record ? readRequestId(record) : null);
  }

  const requestId = readRequestId(record);
  if (requestId === null) return invalidCancel(null);

  return {
    ok: true,
    request: { type: API_CANCEL_MESSAGE, requestId },
  };
}

export function isApiCancelRequest(
  value: unknown,
): value is ApiCancelRequest {
  return parseApiCancelRequest(value).ok;
}

function isResponseHeader(value: unknown): boolean {
  const record = asRecord(value);

  return (
    record !== null &&
    typeof record.name === "string" &&
    typeof record.value === "string"
  );
}

function isApiExecutionError(
  value: unknown,
): value is ApiExecutionError {
  const record = asRecord(value);
  if (!record) return false;

  return (
    typeof record.code === "string" &&
    (API_EXECUTION_ERROR_CODES as readonly string[]).includes(
      record.code,
    ) &&
    typeof record.message === "string"
  );
}

export function isApiExecutionResponse(
  value: unknown,
): value is ApiExecutionResponse {
  const record = asRecord(value);

  if (
    !record ||
    record.type !== API_EXECUTION_MESSAGE ||
    (typeof record.requestId !== "string" &&
      record.requestId !== null)
  ) {
    return false;
  }

  if (record.ok === true) {
    if (
      typeof record.requestId !== "string" ||
      record.requestId.trim().length === 0
    ) {
      return false;
    }

    const data = asRecord(record.data);
    if (!data) return false;

    return (
      typeof data.status === "number" &&
      Number.isFinite(data.status) &&
      typeof data.statusText === "string" &&
      typeof data.durationMs === "number" &&
      Number.isFinite(data.durationMs) &&
      (data.contentType === null ||
        typeof data.contentType === "string") &&
      typeof data.finalUrl === "string" &&
      Array.isArray(data.headers) &&
      data.headers.every(isResponseHeader) &&
      typeof data.body === "string"
    );
  }

  if (record.ok === false) {
    return isApiExecutionError(record.error);
  }

  return false;
}

export function isApiCancelResponse(
  value: unknown,
): value is ApiCancelResponse {
  const record = asRecord(value);

  if (
    !record ||
    record.type !== API_CANCEL_MESSAGE ||
    (typeof record.requestId !== "string" &&
      record.requestId !== null)
  ) {
    return false;
  }

  if (record.ok === true) {
    if (
      typeof record.requestId !== "string" ||
      record.requestId.trim().length === 0
    ) {
      return false;
    }

    const data = asRecord(record.data);
    return data !== null && typeof data.cancelled === "boolean";
  }

  if (record.ok === false) {
    return isApiExecutionError(record.error);
  }

  return false;
}

export type { BodyContentType, HttpMethod };
