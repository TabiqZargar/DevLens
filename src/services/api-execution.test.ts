import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_CANCEL_MESSAGE,
  API_EXECUTION_MESSAGE,
  createApiExecutionRequest,
  type ApiExecutionRequest,
} from "../features/api/api-execution";
import { createRequestDraft } from "../features/api/api-request";
import {
  sendApiCancelMessage,
  sendApiExecutionMessage,
} from "./api-execution";

function executionRequest(): ApiExecutionRequest {
  const draft = createRequestDraft();
  draft.url = "https://api.example.com/items";

  return createApiExecutionRequest(draft, "req-1");
}

function stubChrome(sendMessage: unknown): void {
  vi.stubGlobal("chrome", {
    runtime: { id: "test-extension", sendMessage },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API execution sender", () => {
  it("returns a runtime-unavailable failure when no extension runtime exists", async () => {
    vi.stubGlobal("chrome", undefined);

    const response = await sendApiExecutionMessage(executionRequest());

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "runtime-unavailable",
        message: "Extension runtime unavailable.",
      },
    });
  });

  it("sends the request and returns a matching success response", async () => {
    const request = executionRequest();
    const success = {
      type: API_EXECUTION_MESSAGE,
      requestId: request.requestId,
      ok: true,
      data: {
        status: 200,
        statusText: "OK",
        durationMs: 42,
        contentType: "application/json",
        finalUrl: request.url,
        headers: [{ name: "content-type", value: "application/json" }],
        body: '{"ok":true}',
      },
    };
    const sendMessage = vi.fn().mockResolvedValue(success);
    stubChrome(sendMessage);

    const response = await sendApiExecutionMessage(request);

    expect(sendMessage).toHaveBeenCalledWith(request);
    expect(response).toEqual(success);
  });

  it("passes structured failures through unchanged", async () => {
    const request = executionRequest();
    const failure = {
      type: API_EXECUTION_MESSAGE,
      requestId: request.requestId,
      ok: false,
      error: {
        code: "not-implemented",
        message: "Request execution is not implemented yet.",
      },
    };
    stubChrome(vi.fn().mockResolvedValue(failure));

    const response = await sendApiExecutionMessage(request);

    expect(response).toEqual(failure);
  });

  it("rejects a response for a different request", async () => {
    stubChrome(
      vi.fn().mockResolvedValue({
        type: API_EXECUTION_MESSAGE,
        requestId: "req-2",
        ok: false,
        error: {
          code: "not-implemented",
          message: "Request execution is not implemented yet.",
        },
      }),
    );

    const response = await sendApiExecutionMessage(executionRequest());

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "invalid-response",
        message: "The background worker returned an invalid response.",
      },
    });
  });

  it("rejects malformed responses", async () => {
    stubChrome(vi.fn().mockResolvedValue({ ok: true }));

    const response = await sendApiExecutionMessage(executionRequest());

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "invalid-response",
        message: "The background worker returned an invalid response.",
      },
    });
  });

  it("returns a fixed runtime-error message without echoing details", async () => {
    stubChrome(
      vi.fn().mockRejectedValue(new Error("sensitive backend details")),
    );

    const response = await sendApiExecutionMessage(executionRequest());

    expect(response).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "runtime-error",
        message: "The background worker did not respond.",
      },
    });
  });

  it("never performs a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    stubChrome(vi.fn().mockResolvedValue({ ok: true }));

    await sendApiExecutionMessage(executionRequest());

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("API cancellation sender", () => {
  it("returns a runtime-unavailable failure when no extension runtime exists", async () => {
    vi.stubGlobal("chrome", undefined);

    const response = await sendApiCancelMessage("req-1");

    expect(response).toEqual({
      type: API_CANCEL_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "runtime-unavailable",
        message: "Extension runtime unavailable.",
      },
    });
  });

  it("sends and validates a cancellation response", async () => {
    const success = {
      type: API_CANCEL_MESSAGE,
      requestId: "req-1",
      ok: true,
      data: { cancelled: true },
    };
    const sendMessage = vi.fn().mockResolvedValue(success);
    stubChrome(sendMessage);

    const response = await sendApiCancelMessage("  req-1  ");

    expect(sendMessage).toHaveBeenCalledWith({
      type: API_CANCEL_MESSAGE,
      requestId: "req-1",
    });
    expect(response).toEqual(success);
  });

  it("rejects a cancellation response for a different request", async () => {
    stubChrome(
      vi.fn().mockResolvedValue({
        type: API_CANCEL_MESSAGE,
        requestId: "req-2",
        ok: true,
        data: { cancelled: true },
      }),
    );

    const response = await sendApiCancelMessage("req-1");

    expect(response).toEqual({
      type: API_CANCEL_MESSAGE,
      requestId: "req-1",
      ok: false,
      error: {
        code: "invalid-response",
        message: "The background worker returned an invalid response.",
      },
    });
  });
});
