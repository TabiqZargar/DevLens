import { afterEach, describe, expect, it, vi } from "vitest";
import { API_EXECUTION_MESSAGE } from "../features/api/api-execution";
import {
  handleApiExecutionMessage,
  handleBackgroundMessage,
  handleRuntimeMessage,
} from "./message-handler";

function executableMessage(): Record<string, unknown> {
  return {
    type: API_EXECUTION_MESSAGE,
    requestId: "req-1",
    method: "GET",
    url: "https://api.example.com/items",
    params: [],
    headers: [],
    body: { contentType: "none", content: "" },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("background message handler", () => {
  it("answers ping requests with worker metadata", async () => {
    const response = await handleRuntimeMessage({ type: "devlens:ping" });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data).toMatchObject({ service: "background" });
    }
  });

  it("rejects unsupported message shapes", async () => {
    const response = await handleRuntimeMessage({
      type: "devlens:unknown",
    } as never);

    expect(response).toEqual({
      ok: false,
      error: "Unsupported request.",
    });
  });
});

describe("background message router", () => {
  it("routes ping requests", async () => {
    const response = await handleBackgroundMessage({
      type: "devlens:ping",
    });

    expect(response.ok).toBe(true);
  });

  it("routes unknown messages to the unsupported response", async () => {
    const response = await handleBackgroundMessage({
      type: "devlens:unknown",
    });

    expect(response).toEqual({
      ok: false,
      error: "Unsupported request.",
    });
  });

  it("reports that execution is not implemented yet", async () => {
    const response = await handleBackgroundMessage(executableMessage());

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "not-implemented",
        message: "Request execution is not implemented yet.",
      },
    });
  });

  it("rejects malformed execution messages without leaking details", async () => {
    const response = await handleApiExecutionMessage({
      ...executableMessage(),
      method: "TRACE",
    });

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "invalid-request",
        message: "Malformed API execution request.",
      },
    });
  });

  it("returns a null request id when the message has none", async () => {
    const response = await handleApiExecutionMessage({
      type: API_EXECUTION_MESSAGE,
    });

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: null,
      ok: false,
      error: {
        code: "invalid-request",
        message: "Malformed API execution request.",
      },
    });
  });

  it("never performs a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await handleBackgroundMessage(executableMessage());
    await handleApiExecutionMessage({ type: API_EXECUTION_MESSAGE });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
