import { describe, expect, it } from "vitest";
import {
  API_EXECUTION_MESSAGE,
  createApiExecutionRequest,
  isApiExecutionMessage,
  isApiExecutionRequest,
  isApiExecutionResponse,
  parseApiExecutionRequest,
} from "./api-execution";
import { createRequestDraft, createRow } from "./api-request";

function validMessage(): Record<string, unknown> {
  return {
    type: API_EXECUTION_MESSAGE,
    requestId: "req-1",
    method: "POST",
    url: "https://api.example.com/items",
    params: [{ key: "page", value: "2" }],
    headers: [{ key: "Accept", value: "application/json" }],
    body: {
      contentType: "application/json",
      content: '{"name":"devlens"}',
    },
  };
}

describe("API execution contract", () => {
  it("builds a normalized execution request from a draft", () => {
    const draft = createRequestDraft();
    draft.url = "  https://api.example.com/items  ";
    draft.method = "PUT";
    draft.params = [
      createRow({ key: "  page  ", value: "2" }),
      createRow({ key: "", value: "ignored" }),
      createRow({ key: "disabled", value: "1", enabled: false }),
    ];
    draft.headers = [createRow({ key: "Accept", value: "*/*" })];
    draft.body = { contentType: "none", content: "ignored" };

    const request = createApiExecutionRequest(draft, "  req-42  ");

    expect(request).toEqual({
      type: API_EXECUTION_MESSAGE,
      requestId: "req-42",
      method: "PUT",
      url: "https://api.example.com/items",
      params: [{ key: "page", value: "2" }],
      headers: [{ key: "Accept", value: "*/*" }],
      body: { contentType: "none", content: "" },
    });
  });

  it("preserves body content when a content type is selected", () => {
    const draft = createRequestDraft();
    draft.url = "https://api.example.com/items";
    draft.body = {
      contentType: "application/json",
      content: '{"ok":true}',
    };

    const request = createApiExecutionRequest(draft, "req-1");

    expect(request.body).toEqual({
      contentType: "application/json",
      content: '{"ok":true}',
    });
  });

  it("detects execution messages by their discriminator", () => {
    expect(isApiExecutionMessage(validMessage())).toBe(true);
    expect(isApiExecutionMessage({ type: "devlens:ping" })).toBe(
      false,
    );
    expect(isApiExecutionMessage(null)).toBe(false);
    expect(isApiExecutionMessage("devlens:api-execute")).toBe(false);
  });

  it("parses and normalizes a valid execution request", () => {
    const result = parseApiExecutionRequest({
      ...validMessage(),
      requestId: "  req-1  ",
      url: "  https://api.example.com/items  ",
      params: [{ key: "  page  ", value: "2" }],
    });

    expect(result).toEqual({
      ok: true,
      request: {
        type: API_EXECUTION_MESSAGE,
        requestId: "req-1",
        method: "POST",
        url: "https://api.example.com/items",
        params: [{ key: "page", value: "2" }],
        headers: [{ key: "Accept", value: "application/json" }],
        body: {
          contentType: "application/json",
          content: '{"name":"devlens"}',
        },
      },
    });
  });

  it.each([
    ["null", null],
    ["a string", "devlens:api-execute"],
    ["an empty array", []],
    ["a foreign discriminator", { type: "devlens:ping" }],
  ])("rejects %s", (_label, value) => {
    const result = parseApiExecutionRequest(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.requestId).toBeNull();
      expect(result.error).toEqual({
        code: "invalid-request",
        message: "Malformed API execution request.",
      });
    }
  });

  it("preserves a usable request id on malformed messages", () => {
    const result = parseApiExecutionRequest({
      ...validMessage(),
      method: "TRACE",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.requestId).toBe("req-1");
    }
  });

  it("preserves a usable request id when the discriminator is missing", () => {
    const result = parseApiExecutionRequest({ requestId: "req-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.requestId).toBe("req-1");
    }
  });

  it.each([
    ["an empty request id", { requestId: "   " }],
    ["a missing request id", { requestId: undefined }],
    ["an unsupported method", { method: "TRACE" }],
    ["a relative URL", { url: "/items" }],
    ["a non-http URL", { url: "ftp://api.example.com/items" }],
    ["an empty URL", { url: "" }],
    ["non-array params", { params: {} }],
    ["non-array headers", { headers: "Accept" }],
    [
      "a non-object row",
      { params: [{ key: "page", value: "2" }, "row"] },
    ],
    [
      "a non-string row value",
      { headers: [{ key: "Accept", value: 1 }] },
    ],
    ["a blank row key", { params: [{ key: "  ", value: "2" }] }],
    ["a missing body", { body: undefined }],
    [
      "an unsupported content type",
      { body: { contentType: "application/xml", content: "" } },
    ],
    [
      "non-string body content",
      { body: { contentType: "text/plain", content: 1 } },
    ],
    [
      "body content with a none content type",
      { body: { contentType: "none", content: "unexpected" } },
    ],
  ])("rejects %s", (_label, patch) => {
    const result = parseApiExecutionRequest({
      ...validMessage(),
      ...patch,
    });

    expect(result.ok).toBe(false);
  });

  it("guards execution requests through the parser", () => {
    expect(isApiExecutionRequest(validMessage())).toBe(true);
    expect(
      isApiExecutionRequest({ ...validMessage(), method: "TRACE" }),
    ).toBe(false);
    expect(isApiExecutionRequest(null)).toBe(false);
  });

  it("accepts success and failure responses", () => {
    expect(
      isApiExecutionResponse({
        type: API_EXECUTION_MESSAGE,
        requestId: "req-1",
        ok: true,
        data: {
          status: 200,
          statusText: "OK",
          durationMs: 42,
          contentType: "application/json",
          finalUrl: "https://api.example.com/items",
        },
      }),
    ).toBe(true);

    expect(
      isApiExecutionResponse({
        type: API_EXECUTION_MESSAGE,
        requestId: "req-1",
        ok: false,
        error: {
          code: "not-implemented",
          message: "Request execution is not implemented yet.",
        },
      }),
    ).toBe(true);

    expect(
      isApiExecutionResponse({
        type: API_EXECUTION_MESSAGE,
        requestId: null,
        ok: false,
        error: {
          code: "invalid-request",
          message: "Malformed API execution request.",
        },
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["a foreign discriminator", { type: "devlens:ping" }],
    ["a missing ok flag", { ...validMessage(), requestId: "req-1" }],
    [
      "a missing request id",
      {
        type: API_EXECUTION_MESSAGE,
        ok: false,
        error: { code: "runtime-error", message: "failed" },
      },
    ],
    [
      "a non-numeric status",
      {
        type: API_EXECUTION_MESSAGE,
        requestId: "req-1",
        ok: true,
        data: {
          status: "200",
          statusText: "OK",
          durationMs: 42,
          contentType: null,
          finalUrl: "https://api.example.com/items",
        },
      },
    ],
    [
      "a non-finite duration",
      {
        type: API_EXECUTION_MESSAGE,
        requestId: "req-1",
        ok: true,
        data: {
          status: 200,
          statusText: "OK",
          durationMs: Number.NaN,
          contentType: null,
          finalUrl: "https://api.example.com/items",
        },
      },
    ],
    [
      "an unknown error code",
      {
        type: API_EXECUTION_MESSAGE,
        requestId: "req-1",
        ok: false,
        error: { code: "mystery", message: "failed" },
      },
    ],
    [
      "a success response with a null request id",
      {
        type: API_EXECUTION_MESSAGE,
        requestId: null,
        ok: true,
        data: {
          status: 200,
          statusText: "OK",
          durationMs: 42,
          contentType: null,
          finalUrl: "https://api.example.com/items",
        },
      },
    ],
  ])("rejects a response with %s", (_label, value) => {
    expect(isApiExecutionResponse(value)).toBe(false);
  });
});
