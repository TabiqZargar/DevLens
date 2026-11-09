import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_INSPECTION_LIMITS,
  PAGE_INSPECTION_MESSAGE,
  type PageInspectionResult,
} from "../features/page/page-inspection";
import { inspectPageTab } from "./page-inspection";

function emptyResult(): PageInspectionResult {
  return {
    overview: {
      title: "Example",
      url: "https://example.com/",
      metaDescription: null,
      canonicalUrl: null,
      language: "en",
      viewport: null,
    },
    headings: {
      items: [],
      total: 0,
      truncated: false,
      h1Count: 0,
      missingH1: true,
      jumps: [],
    },
    links: {
      items: [],
      total: 0,
      truncated: false,
      emptyTextCount: 0,
    },
    images: {
      items: [],
      total: 0,
      truncated: false,
      missingAltCount: 0,
    },
    forms: {
      items: [],
      total: 0,
      truncated: false,
      controlCount: 0,
      unlabeledControlCount: 0,
      sampledControls: 0,
    },
    accessibility: { findings: [] },
    capturedAt: "2026-01-01T00:00:00.000Z",
    limits: PAGE_INSPECTION_LIMITS,
  };
}

function successResponse() {
  return {
    type: PAGE_INSPECTION_MESSAGE,
    ok: true as const,
    data: emptyResult(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("page inspection service", () => {
  it("injects the content script and returns a validated result", async () => {
    const executeScript = vi.fn(async () => []);
    const sendMessage = vi.fn(async () => successResponse());

    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      scripting: { executeScript },
      tabs: { sendMessage },
    });

    const response = await inspectPageTab(42);

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["content.js"],
    });
    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: PAGE_INSPECTION_MESSAGE,
    });
    expect(response).toMatchObject({
      type: PAGE_INSPECTION_MESSAGE,
      ok: true,
      data: { overview: { title: "Example" } },
    });
  });

  it("rejects a missing target without touching chrome", async () => {
    const executeScript = vi.fn();
    const sendMessage = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      scripting: { executeScript },
      tabs: { sendMessage },
    });

    const response = await inspectPageTab(null);

    expect(response).toMatchObject({
      ok: false,
      error: { code: "no-target" },
    });
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("reports an unavailable extension runtime", async () => {
    vi.stubGlobal("chrome", undefined);

    const response = await inspectPageTab(7);

    expect(response).toMatchObject({
      ok: false,
      error: { code: "runtime-unavailable" },
    });
  });

  it("maps injection failures to a restricted page error", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      scripting: {
        executeScript: vi.fn(async () => {
          throw new Error("Cannot access a chrome:// URL");
        }),
      },
      tabs: { sendMessage: vi.fn() },
    });

    const response = await inspectPageTab(7);

    expect(response).toMatchObject({
      ok: false,
      error: { code: "restricted" },
    });
  });

  it("maps missing content-script responses to a retryable error", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      scripting: { executeScript: vi.fn(async () => []) },
      tabs: {
        sendMessage: vi.fn(async () => {
          throw new Error("Receiving end does not exist");
        }),
      },
    });

    const response = await inspectPageTab(7);

    expect(response).toMatchObject({
      ok: false,
      error: { code: "no-response" },
    });
  });

  it("rejects malformed inspection responses", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      scripting: { executeScript: vi.fn(async () => []) },
      tabs: {
        sendMessage: vi.fn(async () => ({
          type: PAGE_INSPECTION_MESSAGE,
          ok: true,
          data: { overview: {} },
        })),
      },
    });

    const response = await inspectPageTab(7);

    expect(response).toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
  });
});
