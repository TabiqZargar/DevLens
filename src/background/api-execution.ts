import {
  API_EXECUTION_DEFAULT_TIMEOUT_MS,
  API_EXECUTION_MAX_TIMEOUT_MS,
  API_EXECUTION_MESSAGE,
  API_EXECUTION_MIN_TIMEOUT_MS,
  type ApiExecutionErrorCode,
  type ApiExecutionRequest,
  type ApiExecutionResponse,
  type ApiResponseHeader,
} from "../features/api/api-execution";
import {
  hasOriginPermission,
  originPatternForUrl,
} from "../services/permissions";

export interface ApiExecutionDependencies {
  fetch: typeof fetch;
  hasOriginPermission: (url: string) => Promise<boolean>;
  now: () => number;
}

interface ActiveRequest {
  controller: AbortController;
  cause: "timeout" | "cancel" | null;
}

const activeRequests = new Map<string, ActiveRequest>();

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type BodyReadResult =
  | { ok: true; body: string }
  | { ok: false };

const defaultDependencies: ApiExecutionDependencies = {
  fetch: (input, init) => fetch(input, init),
  hasOriginPermission,
  now: () => Date.now(),
};

export function cancelApiExecution(requestId: string): boolean {
  const active = activeRequests.get(requestId);
  if (!active) return false;

  active.cause = "cancel";
  active.controller.abort();
  return true;
}

function failure(
  requestId: string | null,
  code: ApiExecutionErrorCode,
  message: string,
): ApiExecutionResponse {
  return {
    type: API_EXECUTION_MESSAGE,
    requestId,
    ok: false,
    error: { code, message },
  };
}

function resolveTimeout(timeoutMs: number): number {
  return Number.isInteger(timeoutMs) &&
    timeoutMs >= API_EXECUTION_MIN_TIMEOUT_MS &&
    timeoutMs <= API_EXECUTION_MAX_TIMEOUT_MS
    ? timeoutMs
    : API_EXECUTION_DEFAULT_TIMEOUT_MS;
}

function buildUrl(request: ApiExecutionRequest): string {
  const url = new URL(request.url);

  for (const param of request.params) {
    url.searchParams.append(param.key, param.value);
  }

  return url.toString();
}

function buildInit(request: ApiExecutionRequest): RequestInit {
  const headers = new Headers();

  for (const header of request.headers) {
    headers.append(header.key, header.value);
  }

  let body: string | undefined;

  if (request.body.contentType !== "none") {
    body = request.body.content;
    if (!headers.has("content-type")) {
      headers.set("content-type", request.body.contentType);
    }
  }

  return { method: request.method, headers, body };
}

function readHeaders(headers: Headers): ApiResponseHeader[] {
  const result: ApiResponseHeader[] = [];
  headers.forEach((value, name) => {
    result.push({ name, value });
  });
  return result;
}

function exceedsLimit(byteLength: number): boolean {
  return byteLength > MAX_RESPONSE_BYTES;
}

async function readResponseBody(
  response: Response,
): Promise<BodyReadResult> {
  const contentLength = response.headers.get("content-length");
  const stream = response.body;

  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && exceedsLimit(declared)) {
      if (stream) {
        try {
          await stream.cancel();
        } catch {
          // The body is discarded either way.
        }
      }
      return { ok: false };
    }
  }

  if (!stream || typeof stream.getReader !== "function") {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).byteLength;
    return exceedsLimit(byteLength)
      ? { ok: false }
      : { ok: true, body: text };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (exceedsLimit(total)) {
        await reader.cancel();
        return { ok: false };
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, body: new TextDecoder().decode(combined) };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export async function executeApiRequest(
  request: ApiExecutionRequest,
  overrides: Partial<ApiExecutionDependencies> = {},
): Promise<ApiExecutionResponse> {
  const deps: ApiExecutionDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  if (!originPatternForUrl(request.url)) {
    return failure(
      request.requestId,
      "invalid-request",
      "Malformed API execution request.",
    );
  }

  if (
    request.method === "GET" &&
    request.body.contentType !== "none"
  ) {
    return failure(
      request.requestId,
      "unsupported",
      "GET requests cannot include a body.",
    );
  }

  let permitted = false;

  try {
    permitted = await deps.hasOriginPermission(request.url);
  } catch {
    permitted = false;
  }

  if (!permitted) {
    return failure(
      request.requestId,
      "permission-denied",
      "The extension does not have permission to access this origin.",
    );
  }

  const url = buildUrl(request);
  const controller = new AbortController();
  const active: ActiveRequest = { controller, cause: null };

  const existing = activeRequests.get(request.requestId);
  if (existing) {
    existing.cause = "cancel";
    existing.controller.abort();
  }
  activeRequests.set(request.requestId, active);

  const timer = setTimeout(() => {
    active.cause = "timeout";
    controller.abort();
  }, resolveTimeout(request.timeoutMs));

  const startedAt = deps.now();

  try {
    const response = await deps.fetch(url, {
      ...buildInit(request),
      signal: controller.signal,
    });
    const bodyResult = await readResponseBody(response);

    if (!bodyResult.ok) {
      return failure(
        request.requestId,
        "response-too-large",
        "The response exceeded the 2 MB inspection limit.",
      );
    }

    const durationMs = Math.max(
      0,
      Math.round(deps.now() - startedAt),
    );

    return {
      type: API_EXECUTION_MESSAGE,
      requestId: request.requestId,
      ok: true,
      data: {
        status: response.status,
        statusText: response.statusText,
        durationMs,
        contentType: response.headers.get("content-type"),
        finalUrl: response.url || url,
        headers: readHeaders(response.headers),
        body: bodyResult.body,
      },
    };
  } catch (error) {
    if (active.cause === "timeout") {
      return failure(
        request.requestId,
        "timeout",
        "The request timed out.",
      );
    }

    if (active.cause === "cancel" || isAbortError(error)) {
      return failure(
        request.requestId,
        "aborted",
        "The request was cancelled.",
      );
    }

    return failure(
      request.requestId,
      "network-error",
      "The request failed due to a network error.",
    );
  } finally {
    clearTimeout(timer);
    if (activeRequests.get(request.requestId) === active) {
      activeRequests.delete(request.requestId);
    }
  }
}
