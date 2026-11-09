import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkspace } from "./runtime";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubChrome(tabId: number | null = 42) {
  const create = vi.fn(async () => ({}));
  const query = vi.fn(async () =>
    tabId === null ? [] : [{ id: tabId }],
  );

  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension",
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    tabs: { create, query },
  });

  return { create, query };
}

describe("openWorkspace", () => {
  it("passes an explicit target tab id before the hash route", async () => {
    const { create, query } = stubChrome();

    await openWorkspace("page", { targetTabId: 42 });

    expect(query).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      url: "chrome-extension://test/workspace.html?targetTabId=42#/page",
    });
  });

  it("resolves the active tab when no target is supplied", async () => {
    const { create, query } = stubChrome(77);

    await openWorkspace("page");

    expect(query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(create).toHaveBeenCalledWith({
      url: "chrome-extension://test/workspace.html?targetTabId=77#/page",
    });
  });

  it("omits the target query when the active tab is unavailable", async () => {
    const { create } = stubChrome(null);

    await openWorkspace("page");

    expect(create).toHaveBeenCalledWith({
      url: "chrome-extension://test/workspace.html#/page",
    });
  });
});
