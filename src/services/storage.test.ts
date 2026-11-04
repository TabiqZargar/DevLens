import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStoredValue, writeStoredValue } from "./storage";

const chromeStore = new Map<string, unknown>();

function createChromeMock() {
  return {
    runtime: { id: "test-extension" },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: chromeStore.get(key) }),
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) {
            chromeStore.set(key, value);
          }
        },
      },
    },
  };
}

describe("storage service", () => {
  beforeEach(() => {
    chromeStore.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses chrome.storage.local when the extension runtime is available", async () => {
    vi.stubGlobal("chrome", createChromeMock());

    await writeStoredValue("profile", { name: "devlens" });

    await expect(readStoredValue("profile", null)).resolves.toEqual({
      name: "devlens",
    });
  });

  it("falls back to localStorage outside an extension context", async () => {
    vi.stubGlobal("chrome", undefined);

    await writeStoredValue("draft", { step: 2 });

    await expect(readStoredValue("draft", null)).resolves.toEqual({ step: 2 });
    expect(window.localStorage.getItem("draft")).toBe('{"step":2}');
  });

  it("returns the fallback for a missing key", async () => {
    vi.stubGlobal("chrome", createChromeMock());

    await expect(readStoredValue("missing", "fallback")).resolves.toBe(
      "fallback",
    );
  });
});
