import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../shared/constants";
import { DEFAULT_SETTINGS } from "../shared/settings";
import { loadSettings, saveSettings } from "./settings";

interface ChromeStorageStub {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function stubChromeStorage(
  initial: Record<string, unknown> = {},
): ChromeStorageStub {
  const store = { ...initial };
  const get = vi.fn(async (key: string) => ({
    [key]: store[key],
  }));
  const set = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(store, values);
  });

  vi.stubGlobal("chrome", {
    storage: { local: { get, set } },
  });

  return { store, get, set };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings", () => {
  it("loads defaults when storage is empty", async () => {
    stubChromeStorage();

    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("persists the endpoint and selected model", async () => {
    const storage = stubChromeStorage();
    const settings = {
      ollamaEndpoint: "http://localhost:11434",
      ollamaModel: "llama3.2:latest",
    };

    await saveSettings(settings);

    expect(storage.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.settings]: settings,
    });
    await expect(loadSettings()).resolves.toEqual(settings);
  });

  it("repairs missing or malformed stored values", async () => {
    stubChromeStorage({
      [STORAGE_KEYS.settings]: {
        ollamaEndpoint: 42,
        ollamaModel: null,
        unrelated: true,
      },
    });

    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});
