import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_INSPECTION_MESSAGE,
  type PageInspectionResponse,
} from "../features/page/page-inspection";

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;

async function loadContentScript() {
  const addListener = vi.fn();

  vi.stubGlobal("chrome", {
    runtime: { onMessage: { addListener } },
  });

  vi.resetModules();
  await import("./index");

  const listener = addListener.mock.calls[0]?.[0] as
    | MessageListener
    | undefined;

  if (!listener) {
    throw new Error("Content script did not register a message listener.");
  }

  return { addListener, listener };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__devlensContentReady");
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("content script messages", () => {
  it("returns a page inspection result for a valid request", async () => {
    document.title = "Content page";
    document.documentElement.lang = "en";
    document.body.innerHTML =
      '<main><h1>Content</h1><img src="/logo.png" alt="Logo" /></main>';

    const { listener } = await loadContentScript();
    const sendResponse = vi.fn();

    const keepChannelOpen = listener(
      { type: PAGE_INSPECTION_MESSAGE },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(false);

    const response = sendResponse.mock
      .calls[0]?.[0] as PageInspectionResponse;

    expect(response).toMatchObject({
      type: PAGE_INSPECTION_MESSAGE,
      ok: true,
      data: {
        overview: { title: "Content page", language: "en" },
        headings: { items: [{ level: 1, text: "Content" }] },
        images: { items: [{ alt: "Logo", missingAlt: false }] },
      },
    });
  });

  it("still answers the legacy page-metadata request", async () => {
    document.title = "Metadata page";

    const { listener } = await loadContentScript();
    const sendResponse = vi.fn();

    listener(
      { type: "devlens:page-metadata" },
      {},
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      data: {
        title: "Metadata page",
        url: window.location.href,
        capturedAt: expect.any(String),
      },
    });
  });

  it("ignores unrelated messages and registers only once", async () => {
    const { addListener, listener } = await loadContentScript();
    const sendResponse = vi.fn();

    expect(listener({ type: "devlens:unknown" }, {}, sendResponse)).toBe(
      false,
    );
    expect(sendResponse).not.toHaveBeenCalled();

    vi.resetModules();
    await import("./index");

    expect(addListener).toHaveBeenCalledTimes(1);
  });
});
