import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider } from "./local-ai";

const ENDPOINT = "http://127.0.0.1:11434";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatResponse(chunks: readonly (string | Uint8Array)[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(
            typeof chunk === "string" ? encoder.encode(chunk) : chunk,
          );
        }

        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    },
  );
}

function chatLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function chatProvider(
  fetchMock: ReturnType<typeof vi.fn>,
  overrides: {
    hasOriginPermission?: () => Promise<boolean>;
    chatTimeoutMs?: number;
  } = {},
) {
  return createOllamaProvider({
    fetch: fetchMock as unknown as typeof fetch,
    hasOriginPermission:
      overrides.hasOriginPermission ?? (async () => true),
    chatTimeoutMs: overrides.chatTimeoutMs ?? 1_000,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createOllamaProvider", () => {
  it("checks only the loopback tags endpoint and returns models", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        models: [
          { name: "llama3.2:latest", size: 2_000_000_000 },
          { name: "qwen2.5-coder:7b" },
        ],
      }),
    );
    const provider = createOllamaProvider({
      fetch: fetchMock as unknown as typeof fetch,
      hasOriginPermission: async () => true,
      timeoutMs: 1_000,
    });

    const result = await provider.checkConnection(`${ENDPOINT}/`);

    expect(result).toMatchObject({
      ok: true,
      endpoint: ENDPOINT,
      models: [
        { name: "llama3.2:latest", sizeBytes: 2_000_000_000 },
        { name: "qwen2.5-coder:7b" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${ENDPOINT}/api/tags`,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
      }),
    );
  });

  it("returns an empty connected result when no models are installed", async () => {
    const provider = createOllamaProvider({
      fetch: vi.fn(async () =>
        jsonResponse({ models: [] }),
      ) as unknown as typeof fetch,
      hasOriginPermission: async () => true,
    });

    await expect(provider.checkConnection(ENDPOINT)).resolves.toMatchObject(
      { ok: true, models: [] },
    );
  });

  it("rejects remote endpoints before requesting permission or network access", async () => {
    const permissionMock = vi.fn(async () => true);
    const fetchMock = vi.fn();
    const provider = createOllamaProvider({
      fetch: fetchMock as unknown as typeof fetch,
      hasOriginPermission: permissionMock,
    });

    const result = await provider.checkConnection(
      "https://api.example.com/v1",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid-endpoint" },
    });
    expect(permissionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch without an origin permission", async () => {
    const fetchMock = vi.fn();
    const provider = createOllamaProvider({
      fetch: fetchMock as unknown as typeof fetch,
      hasOriginPermission: async () => false,
    });

    const result = await provider.checkConnection(ENDPOINT);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports HTTP, network, and malformed responses with fixed errors", async () => {
    const httpProvider = createOllamaProvider({
      fetch: vi.fn(async () =>
        new Response("unavailable", { status: 503 }),
      ) as unknown as typeof fetch,
      hasOriginPermission: async () => true,
    });
    const networkProvider = createOllamaProvider({
      fetch: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
      hasOriginPermission: async () => true,
    });
    const invalidJsonProvider = createOllamaProvider({
      fetch: vi.fn(async () =>
        new Response("not-json", { status: 200 }),
      ) as unknown as typeof fetch,
      hasOriginPermission: async () => true,
    });
    const invalidShapeProvider = createOllamaProvider({
      fetch: vi.fn(async () =>
        jsonResponse({ models: "llama3.2" }),
      ) as unknown as typeof fetch,
      hasOriginPermission: async () => true,
    });

    await expect(httpProvider.checkConnection(ENDPOINT)).resolves.toMatchObject(
      { ok: false, error: { code: "http-error" } },
    );
    await expect(
      networkProvider.checkConnection(ENDPOINT),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "network-error" },
    });
    await expect(
      invalidJsonProvider.checkConnection(ENDPOINT),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
    await expect(
      invalidShapeProvider.checkConnection(ENDPOINT),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
  });

  it("rejects oversized model metadata from its content length", async () => {
    const provider = createOllamaProvider({
      fetch: vi.fn(async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-length": String(1024 * 1024 + 1),
          },
        }),
      ) as unknown as typeof fetch,
      hasOriginPermission: async () => true,
    });

    const result = await provider.checkConnection(ENDPOINT);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "response-too-large" },
    });
  });

  it("caps streamed metadata before buffering the full body", async () => {
    const chunk = new Uint8Array(600 * 1024).fill(120);
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);

        if (pulls === 2) {
          controller.close();
        }
      },
    });
    const fetchMock = vi.fn(
      async () => new Response(stream),
    );
    const provider = createOllamaProvider({
      fetch: fetchMock as unknown as typeof fetch,
      hasOriginPermission: async () => true,
    });

    const result = await provider.checkConnection(ENDPOINT);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "response-too-large" },
    });
    expect(pulls).toBeLessThanOrEqual(2);
  });

  it("aborts and reports a timeout when Ollama does not respond", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const provider = createOllamaProvider({
      fetch: fetchMock as unknown as typeof fetch,
      hasOriginPermission: async () => true,
      timeoutMs: 25,
    });

    const pending = provider.checkConnection(ENDPOINT);
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;

    expect(result).toMatchObject({
      ok: false,
      error: { code: "timeout" },
    });
  });

  it("streams chat deltas and posts the selected model and messages", async () => {
    const fetchMock = vi.fn(async () =>
      chatResponse([
        chatLine({
          model: "llama3.2",
          message: { role: "assistant", content: "Hel" },
          done: false,
        }),
        chatLine({
          model: "llama3.2",
          message: { role: "assistant", content: "lo" },
          done: false,
        }),
        chatLine({
          model: "llama3.2",
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
        }),
      ]),
    );
    const provider = chatProvider(fetchMock);
    const tokens: string[] = [];
    const result = await provider.chat({
      endpoint: ENDPOINT,
      model: " llama3.2 ",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Continue" },
      ],
      onToken: (token) => tokens.push(token),
    });

    expect(result).toMatchObject({
      ok: true,
      content: "Hello",
      model: "llama3.2",
    });
    expect(tokens).toEqual(["Hel", "lo"]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ENDPOINT}/api/chat`,
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        redirect: "error",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3.2",
          messages: [
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello" },
            { role: "user", content: "Continue" },
          ],
          stream: true,
        }),
      }),
    );
  });

  it("forwards an explicit system context message", async () => {
    const fetchMock = vi.fn(async () =>
      chatResponse([
        chatLine({
          message: { role: "assistant", content: "Reviewed" },
          done: false,
        }),
        chatLine({ message: {}, done: true }),
      ]),
    );
    const provider = chatProvider(fetchMock);
    const messages = [
      {
        role: "system" as const,
        content: "Use only the supplied code.",
      },
      { role: "user" as const, content: "Review this code." },
    ];

    await expect(
      provider.chat({
        endpoint: ENDPOINT,
        model: "llama3.2",
        messages,
      }),
    ).resolves.toMatchObject({ ok: true, content: "Reviewed" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${ENDPOINT}/api/chat`,
      expect.objectContaining({
        body: JSON.stringify({
          model: "llama3.2",
          messages,
          stream: true,
        }),
      }),
    );
  });

  it("decodes a UTF-8 sequence split across stream chunks", async () => {
    const source = new TextEncoder().encode(
      chatLine({
        model: "llama3.2",
        message: { role: "assistant", content: "Hi 🌍" },
        done: false,
      }) +
        chatLine({
          model: "llama3.2",
          message: { role: "assistant", content: "" },
          done: true,
        }),
    );
    const emojiIndex = new TextEncoder().encode(
      chatLine({
        model: "llama3.2",
        message: { role: "assistant", content: "Hi " },
        done: false,
      }),
    ).byteLength;
    const split = emojiIndex + 2;
    const tokens: string[] = [];
    const provider = chatProvider(
      vi.fn(async () =>
        chatResponse([source.slice(0, split), source.slice(split)]),
      ),
    );

    const result = await provider.chat({
      endpoint: ENDPOINT,
      model: "llama3.2",
      messages: [{ role: "user", content: "Hi" }],
      onToken: (token) => tokens.push(token),
    });

    expect(result).toMatchObject({ ok: true, content: "Hi 🌍" });
    expect(tokens.join("")).toBe("Hi 🌍");
  });

  it("tolerates malformed lines when a valid response is present", async () => {
    const provider = chatProvider(
      vi.fn(async () =>
        chatResponse([
          "not-json\n",
          chatLine({
            message: { role: "assistant", content: "Still here" },
            done: false,
          }),
          chatLine({ message: {}, done: true }),
        ]),
      ),
    );

    await expect(
      provider.chat({
        endpoint: ENDPOINT,
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).resolves.toMatchObject({
      ok: true,
      content: "Still here",
    });
  });

  it("stops an in-flight stream and returns its partial content", async () => {
    const controller = new AbortController();
    const tokens: string[] = [];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const encoder = new TextEncoder();

        return new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              streamController.enqueue(
                encoder.encode(
                  chatLine({
                    message: {
                      role: "assistant",
                      content: "Partial",
                    },
                    done: false,
                  }),
                ),
              );
              init?.signal?.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                streamController.error(error);
              });
            },
          }),
          { status: 200 },
        );
      },
    );
    const provider = chatProvider(fetchMock);
    const pending = provider.chat({
      endpoint: ENDPOINT,
      model: "llama3.2",
      messages: [{ role: "user", content: "Hi" }],
      signal: controller.signal,
      onToken: (token) => tokens.push(token),
    });

    await vi.waitFor(() => {
      expect(tokens).toEqual(["Partial"]);
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "aborted" },
      partialContent: "Partial",
    });
  });

  it("reports empty, incomplete, and malformed-only responses", async () => {
    const emptyProvider = chatProvider(
      vi.fn(async () =>
        chatResponse([
          chatLine({ message: { content: "" }, done: true }),
        ]),
      ),
    );
    const incompleteProvider = chatProvider(
      vi.fn(async () =>
        chatResponse([
          chatLine({
            message: { role: "assistant", content: "Cut off" },
            done: false,
          }),
        ]),
      ),
    );
    const malformedProvider = chatProvider(
      vi.fn(async () => chatResponse(["not-json\n"])),
    );
    const request = {
      endpoint: ENDPOINT,
      model: "llama3.2",
      messages: [
        { role: "user" as const, content: "Hi" },
      ],
    };

    await expect(emptyProvider.chat(request)).resolves.toMatchObject({
      ok: false,
      error: { code: "empty-response" },
    });
    await expect(
      incompleteProvider.chat(request),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "incomplete-response" },
      partialContent: "Cut off",
    });
    await expect(
      malformedProvider.chat(request),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
  });

  it("validates the request and origin before chat fetch", async () => {
    const fetchMock = vi.fn();
    const provider = chatProvider(fetchMock, {
      hasOriginPermission: async () => false,
    });

    await expect(
      provider.chat({
        endpoint: "https://api.example.com",
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-endpoint" },
    });
    await expect(
      provider.chat({
        endpoint: ENDPOINT,
        model: " ",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "missing-model" },
    });
    await expect(
      provider.chat({
        endpoint: ENDPOINT,
        model: "llama3.2",
        messages: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-request" },
    });
    await expect(
      provider.chat({
        endpoint: ENDPOINT,
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports chat HTTP errors and times out an unresponsive stream", async () => {
    vi.useFakeTimers();
    const httpProvider = chatProvider(
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    const timeoutProvider = chatProvider(
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      ),
      { chatTimeoutMs: 25 },
    );
    const pending = timeoutProvider.chat({
      endpoint: ENDPOINT,
      model: "llama3.2",
      messages: [{ role: "user", content: "Hi" }],
    });

    await expect(
      httpProvider.chat({
        endpoint: ENDPOINT,
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "http-error" },
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "timeout" },
    });
  });

  it("caps a chat response before buffering an oversized body", async () => {
    const provider = chatProvider(
      vi.fn(async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-length": String(2 * 1024 * 1024 + 1),
          },
        }),
      ),
    );

    await expect(
      provider.chat({
        endpoint: ENDPOINT,
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "response-too-large" },
    });
  });
});
