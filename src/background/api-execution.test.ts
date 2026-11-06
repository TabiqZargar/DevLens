import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_EXECUTION_MESSAGE,
  type ApiExecutionRequest,
} from "../features/api/api-execution";
import {
  cancelApiExecution,
  executeApiRequest,
  type ApiExecutionDependencies,
} from "./api-execution";

function makeRequest(
  overrides: Partial<ApiExecutionRequest> = {},
): ApiExecutionRequest {
  return {
    type: API_EXECUTION_MESSAGE,
    requestId: "req-1",
    method: "GET",
    url: "https://api.example.com/items",
    params: [],
    headers: [],
    body: { contentType: "none", content: "" },
    timeoutMs: 30_000,
    ...overrides,
  };
}

interface FakeResponseOptions {
  status?: number;
  statusText?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeResponse({
  status = 200,
  statusText = "OK",
  url = "https://api.example.com/items",
  headers = {},
  body = "",
}: FakeResponseOptions = {}): Response {
  return {
    status,
    statusText,
    url,
    headers: new Headers(headers),
    text: async () => body,
  } as unknown as Response;
}

function makeDeps(
  overrides: Partial<ApiExecutionDependencies> = {},
): ApiExecutionDependencies {
  return {
    fetch: vi.fn(async () => fakeResponse()) as unknown as typeof fetch,
    hasOriginPermission: async () => true,
    now: () => 1_000,
    ...overrides,
  };
}

function abortingFetch(): typeof fetch {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("background API execution", () => {
  it("executes a request and returns status, headers, body, and timing", async () => {
    let tick = 1_000;
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        fakeResponse({
          status: 201,
          statusText: "Created",
          url: "https://api.example.com/items?page=2",
          headers: {
            "content-type": "application/json",
            "x-request-id": "abc",
          },
          body: '{"id":1}',
        }),
    );

    const response = await executeApiRequest(
      makeRequest(),
      makeDeps({
        fetch: fetchMock as unknown as typeof fetch,
        now: () => {
          const value = tick;
          tick += 42;
          return value;
        },
      }),
    );

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: true,
      data: {
        status: 201,
        statusText: "Created",
        durationMs: 42,
        contentType: "application/json",
        finalUrl: "https://api.example.com/items?page=2",
        headers: [
          { name: "content-type", value: "application/json" },
          { name: "x-request-id", value: "abc" },
        ],
        body: '{"id":1}',
      },
    });
  });

  it("appends enabled query parameters and forwards headers", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => fakeResponse(),
    );

    await executeApiRequest(
      makeRequest({
        method: "POST",
        params: [
          { key: "page", value: "2" },
          { key: "q", value: "a b" },
        ],
        headers: [{ key: "Accept", value: "application/json" }],
        body: {
          contentType: "application/json",
          content: '{"name":"devlens"}',
        },
      }),
      makeDeps({ fetch: fetchMock as unknown as typeof fetch }),
    );

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;

    const [url, init] = call;
    expect(init).toBeDefined();
    if (!init) return;

    expect(url).toBe(
      "https://api.example.com/items?page=2&q=a+b",
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"name":"devlens"}');

    const headers = new Headers(init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the body and content type for none bodies", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => fakeResponse(),
    );

    await executeApiRequest(
      makeRequest({ method: "POST" }),
      makeDeps({ fetch: fetchMock as unknown as typeof fetch }),
    );

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    if (!init) return;

    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it("preserves a caller-supplied content type header", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => fakeResponse(),
    );

    await executeApiRequest(
      makeRequest({
        method: "POST",
        headers: [{ key: "Content-Type", value: "text/custom" }],
        body: { contentType: "application/json", content: "payload" },
      }),
      makeDeps({ fetch: fetchMock as unknown as typeof fetch }),
    );

    const init = fetchMock.mock.calls[0]?.[1];

    expect(new Headers(init?.headers).get("content-type")).toBe(
      "text/custom",
    );
  });

  it("times out a request with a structured error", async () => {
    vi.useFakeTimers();

    const promise = executeApiRequest(
      makeRequest({ timeoutMs: 1_000 }),
      makeDeps({ fetch: abortingFetch() }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    const response = await promise;

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "timeout",
        message: "The request timed out.",
      },
    });
  });

  it("cancels an in-flight request", async () => {
    const fetchMock = abortingFetch();

    const promise = executeApiRequest(
      makeRequest(),
      makeDeps({ fetch: fetchMock }),
    );

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(cancelApiExecution("req-1")).toBe(true);
    const response = await promise;

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "aborted",
        message: "The request was cancelled.",
      },
    });
    expect(cancelApiExecution("req-1")).toBe(false);
  });

  it("treats HTTP error statuses as successful responses", async () => {
    const response = await executeApiRequest(
      makeRequest(),
      makeDeps({
        fetch: (async () =>
          fakeResponse({
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "text/plain" },
            body: "missing",
          })) as unknown as typeof fetch,
      }),
    );

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data.status).toBe(404);
      expect(response.data.statusText).toBe("Not Found");
      expect(response.data.body).toBe("missing");
    }
  });

  it("returns empty and non-JSON bodies as text", async () => {
    const empty = await executeApiRequest(
      makeRequest(),
      makeDeps({
        fetch: (async () =>
          fakeResponse({ body: "" })) as unknown as typeof fetch,
      }),
    );
    const html = await executeApiRequest(
      makeRequest(),
      makeDeps({
        fetch: (async () =>
          fakeResponse({
            headers: { "content-type": "text/html" },
            body: "<html>hello</html>",
          })) as unknown as typeof fetch,
      }),
    );

    expect(empty.ok && empty.data.body).toBe("");
    expect(html.ok && html.data.contentType).toBe("text/html");
    expect(html.ok && html.data.body).toBe("<html>hello</html>");
  });

  it("rejects oversized responses before buffering the full body", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulls = 0;
    const text = vi.fn(async () => {
      throw new Error("the body should not be buffered");
    });

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;

        if (pulls > 4) {
          controller.close();
          return;
        }

        controller.enqueue(chunk);
      },
    });

    const response = {
      status: 200,
      statusText: "OK",
      url: "https://api.example.com/items",
      headers: new Headers(),
      body: stream,
      text,
    } as unknown as Response;

    const result = await executeApiRequest(
      makeRequest(),
      makeDeps({
        fetch: (async () => response) as unknown as typeof fetch,
      }),
    );

    expect(result).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "response-too-large",
        message: "The response exceeded the 2 MB inspection limit.",
      },
    });
    expect(text).not.toHaveBeenCalled();
    expect(pulls).toBeLessThan(5);
  });

  it("refuses to execute without origin permission", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => fakeResponse(),
    );
    const response = await executeApiRequest(
      makeRequest(),
      makeDeps({
        fetch: fetchMock as unknown as typeof fetch,
        hasOriginPermission: async () => false,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "permission-denied",
        message:
          "The extension does not have permission to access this origin.",
      },
    });
  });

  it("refuses to execute when the permission check fails", async () => {
    const response = await executeApiRequest(
      makeRequest(),
      makeDeps({
        hasOriginPermission: async () => {
          throw new Error("permission backend unavailable");
        },
      }),
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe("permission-denied");
    }
  });

  it("maps network failures to a safe fixed message", async () => {
    const response = await executeApiRequest(
      makeRequest(),
      makeDeps({
        fetch: (async () => {
          throw new TypeError("fetch failed: secret token");
        }) as unknown as typeof fetch,
      }),
    );

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "network-error",
        message: "The request failed due to a network error.",
      },
    });
    expect(JSON.stringify(response)).not.toContain("secret token");
  });

  it("rejects unsupported and invalid request configurations", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => fakeResponse(),
    );
    const deps = makeDeps({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const bodyOnGet = await executeApiRequest(
      makeRequest({
        method: "GET",
        body: { contentType: "text/plain", content: "nope" },
      }),
      deps,
    );
    const badUrl = await executeApiRequest(
      makeRequest({ url: "ftp://api.example.com/items" }),
      deps,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(bodyOnGet.ok).toBe(false);
    if (!bodyOnGet.ok) {
      expect(bodyOnGet.error.code).toBe("unsupported");
    }
    expect(badUrl.ok).toBe(false);
    if (!badUrl.ok) {
      expect(badUrl.error.code).toBe("invalid-request");
    }
  });
});
