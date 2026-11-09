import {
  createOllamaChatStreamParser,
  type OllamaChatStreamEvent,
} from "../features/ai/chat";
import {
  OLLAMA_CHAT_MAX_RESPONSE_BYTES,
  OLLAMA_CHAT_TIMEOUT_MS,
  OLLAMA_DEFAULT_TIMEOUT_MS,
  OLLAMA_MAX_RESPONSE_BYTES,
  parseOllamaTags,
  validateOllamaEndpoint,
} from "../features/ai/ollama";
import type {
  LocalAiChatErrorCode,
  LocalAiChatMessage,
  LocalAiChatRequest,
  LocalAiChatResult,
  LocalAiConnectionErrorCode,
  LocalAiConnectionResult,
  LocalAiProvider,
} from "../features/ai/provider";
import { hasOriginPermission } from "./permissions";

export interface OllamaProviderDependencies {
  fetch: typeof fetch;
  hasOriginPermission: (url: string) => Promise<boolean>;
  now: () => number;
  timeoutMs: number;
  chatTimeoutMs: number;
}

const defaultDependencies: OllamaProviderDependencies = {
  fetch: (input, init) => fetch(input, init),
  hasOriginPermission,
  now: () => Date.now(),
  timeoutMs: OLLAMA_DEFAULT_TIMEOUT_MS,
  chatTimeoutMs: OLLAMA_CHAT_TIMEOUT_MS,
};

function failure(
  code: LocalAiConnectionErrorCode,
  message: string,
): LocalAiConnectionResult {
  return { ok: false, error: { code, message } };
}

function chatFailure(
  code: LocalAiChatErrorCode,
  message: string,
  partialContent = "",
): LocalAiChatResult {
  return {
    ok: false,
    error: { code, message },
    partialContent,
  };
}

function isChatRequestValid(
  messages: readonly LocalAiChatMessage[],
): boolean {
  if (messages.length === 0) {
    return false;
  }

  for (const message of messages) {
    if (
      (message.role !== "system" &&
        message.role !== "user" &&
        message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0
    ) {
      return false;
    }
  }

  return true;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false };

async function readResponseText(
  response: Response,
): Promise<BodyReadResult> {
  const contentLength = response.headers.get("content-length");

  if (contentLength !== null) {
    const declared = Number(contentLength);

    if (
      Number.isFinite(declared) &&
      declared > OLLAMA_MAX_RESPONSE_BYTES
    ) {
      return { ok: false };
    }
  }

  const body = response.body;

  if (!body || typeof body.getReader !== "function") {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).byteLength;

    return byteLength > OLLAMA_MAX_RESPONSE_BYTES
      ? { ok: false }
      : { ok: true, text };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      text += decoder.decode();

      return { ok: true, text };
    }

    totalBytes += chunk.value.byteLength;

    if (totalBytes > OLLAMA_MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);

      return { ok: false };
    }

    text += decoder.decode(chunk.value, { stream: true });
  }
}

export function createOllamaProvider(
  overrides: Partial<OllamaProviderDependencies> = {},
): LocalAiProvider {
  const deps: OllamaProviderDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  return {
    id: "ollama",

    async checkConnection(
      endpoint: string,
    ): Promise<LocalAiConnectionResult> {
      const validation = validateOllamaEndpoint(endpoint);

      if (!validation.ok) {
        return failure("invalid-endpoint", validation.message);
      }

      let permitted = false;

      try {
        permitted = await deps.hasOriginPermission(
          validation.endpoint,
        );
      } catch {
        permitted = false;
      }

      if (!permitted) {
        return failure(
          "permission-denied",
          "Chrome has not granted access to this local endpoint.",
        );
      }

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, deps.timeoutMs);

      const startedAt = deps.now();

      try {
        const response = await deps.fetch(
          `${validation.endpoint}/api/tags`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          return failure(
            "http-error",
            `Ollama returned HTTP ${response.status}.`,
          );
        }

        const body = await readResponseText(response);

        if (!body.ok) {
          return failure(
            "response-too-large",
            "Ollama returned a response that is too large to inspect.",
          );
        }

        let parsed: unknown;

        try {
          parsed = JSON.parse(body.text);
        } catch {
          return failure(
            "invalid-response",
            "Ollama returned an unexpected response.",
          );
        }

        const models = parseOllamaTags(parsed);

        if (models === null) {
          return failure(
            "invalid-response",
            "Ollama returned an unexpected response.",
          );
        }

        return {
          ok: true,
          endpoint: validation.endpoint,
          models,
          durationMs: Math.max(0, Math.round(deps.now() - startedAt)),
        };
      } catch (error) {
        if (timedOut || isAbortError(error)) {
          return failure(
            "timeout",
            "Ollama did not respond before the connection timeout.",
          );
        }

        return failure(
          "network-error",
          "Could not reach Ollama. Confirm it is running and allows this extension origin.",
        );
      } finally {
        clearTimeout(timer);
      }
    },

    async chat(request: LocalAiChatRequest): Promise<LocalAiChatResult> {
      const validation = validateOllamaEndpoint(request.endpoint);

      if (!validation.ok) {
        return chatFailure("invalid-endpoint", validation.message);
      }

      const model = request.model.trim();

      if (model.length === 0) {
        return chatFailure(
          "missing-model",
          "Select an installed Ollama model before sending a message.",
        );
      }

      if (!isChatRequestValid(request.messages)) {
        return chatFailure(
          "invalid-request",
          "Enter a message before sending.",
        );
      }

      if (request.signal?.aborted) {
        return chatFailure("aborted", "Generation stopped.");
      }

      let permitted = false;

      try {
        permitted = await deps.hasOriginPermission(
          validation.endpoint,
        );
      } catch {
        permitted = false;
      }

      if (!permitted) {
        return chatFailure(
          "permission-denied",
          "Chrome has not granted access to this local endpoint.",
        );
      }

      if (request.signal?.aborted) {
        return chatFailure("aborted", "Generation stopped.");
      }

      const controller = new AbortController();
      const callerSignal = request.signal;
      let callerAborted = false;
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const abortFromCaller = () => {
        callerAborted = true;
        controller.abort();
      };

      if (callerSignal) {
        if (callerSignal.aborted) {
          callerAborted = true;
          controller.abort();
        } else {
          callerSignal.addEventListener("abort", abortFromCaller, {
            once: true,
          });
        }
      }

      const armTimeout = () => {
        if (timer !== null) {
          clearTimeout(timer);
        }

        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, deps.chatTimeoutMs);
      };

      armTimeout();
      const startedAt = deps.now();
      const parser = createOllamaChatStreamParser();
      let content = "";
      let streamModel: string | null = null;
      let completed = false;
      let streamError = false;
      let sawMalformed = false;
      let sawEvent = false;

      function handleEvents(
        events: readonly OllamaChatStreamEvent[],
      ): void {
        for (const event of events) {
          switch (event.type) {
            case "delta":
              sawEvent = true;
              streamModel = event.model ?? streamModel;
              content += event.content;

              try {
                request.onToken?.(event.content);
              } catch {
                streamError = true;
              }
              break;
            case "done":
              sawEvent = true;
              completed = true;
              streamModel = event.model ?? streamModel;
              break;
            case "error":
              sawEvent = true;
              streamError = true;
              break;
            case "malformed":
              sawMalformed = true;
              break;
          }
        }
      }

      try {
        const response = await deps.fetch(
          `${validation.endpoint}/api/chat`,
          {
            method: "POST",
            headers: {
              Accept: "application/x-ndjson",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: request.messages,
              stream: true,
            }),
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          return chatFailure(
            "http-error",
            `Ollama returned HTTP ${response.status}.`,
            content,
          );
        }

        const contentLength = response.headers.get("content-length");

        if (contentLength !== null) {
          const declared = Number(contentLength);

          if (
            Number.isFinite(declared) &&
            declared > OLLAMA_CHAT_MAX_RESPONSE_BYTES
          ) {
            return chatFailure(
              "response-too-large",
              "Ollama returned a response that is too large to inspect.",
              content,
            );
          }
        }

        armTimeout();
        const body = response.body;

        if (!body || typeof body.getReader !== "function") {
          const text = await response.text();

          if (
            new TextEncoder().encode(text).byteLength >
            OLLAMA_CHAT_MAX_RESPONSE_BYTES
          ) {
            return chatFailure(
              "response-too-large",
              "Ollama returned a response that is too large to inspect.",
              content,
            );
          }

          handleEvents(parser.push(text));
          handleEvents(parser.finish());
        } else {
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let totalBytes = 0;

          while (true) {
            const chunk = await reader.read();

            if (chunk.done) {
              handleEvents(parser.push(decoder.decode()));
              break;
            }

            totalBytes += chunk.value.byteLength;

            if (totalBytes > OLLAMA_CHAT_MAX_RESPONSE_BYTES) {
              await reader.cancel().catch(() => undefined);

              return chatFailure(
                "response-too-large",
                "Ollama returned a response that is too large to inspect.",
                content,
              );
            }

            armTimeout();
            handleEvents(
              parser.push(
                decoder.decode(chunk.value, { stream: true }),
              ),
            );

            if (completed || streamError) {
              await reader.cancel().catch(() => undefined);
              break;
            }
          }

          handleEvents(parser.finish());
        }

        if (callerAborted) {
          return chatFailure(
            "aborted",
            "Generation stopped.",
            content,
          );
        }

        if (timedOut) {
          return chatFailure(
            "timeout",
            "Ollama stopped responding while generating a response.",
            content,
          );
        }

        if (streamError) {
          return chatFailure(
            "invalid-response",
            "Ollama reported an error while generating a response.",
            content,
          );
        }

        if (!sawEvent && sawMalformed) {
          return chatFailure(
            "invalid-response",
            "Ollama returned an unexpected response.",
            content,
          );
        }

        if (!completed) {
          return chatFailure(
            "incomplete-response",
            "Ollama ended the response before it finished.",
            content,
          );
        }

        if (content.trim().length === 0) {
          return chatFailure(
            "empty-response",
            "Ollama returned an empty response.",
            content,
          );
        }

        return {
          ok: true,
          content,
          model: streamModel,
          durationMs: Math.max(0, Math.round(deps.now() - startedAt)),
        };
      } catch (error) {
        if (timedOut) {
          return chatFailure(
            "timeout",
            "Ollama stopped responding while generating a response.",
            content,
          );
        }

        if (callerAborted || isAbortError(error)) {
          return chatFailure(
            "aborted",
            "Generation stopped.",
            content,
          );
        }

        return chatFailure(
          "network-error",
          "Could not reach Ollama. Confirm it is running and allows this extension origin.",
          content,
        );
      } finally {
        if (timer !== null) {
          clearTimeout(timer);
        }

        callerSignal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}

export const ollamaProvider = createOllamaProvider();
