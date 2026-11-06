import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasOriginPermission,
  originPatternForUrl,
  requestOriginPermission,
} from "./permissions";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("origin permission helpers", () => {
  it("derives origin patterns for http and https URLs", () => {
    expect(
      originPatternForUrl("https://api.example.com/items?x=1"),
    ).toBe("https://api.example.com/*");
    expect(originPatternForUrl("http://localhost:3000/path")).toBe(
      "http://localhost/*",
    );
    expect(originPatternForUrl("http://127.0.0.1:8080/api")).toBe(
      "http://127.0.0.1/*",
    );
  });

  it("rejects non-http and malformed URLs", () => {
    expect(originPatternForUrl("ftp://api.example.com")).toBeNull();
    expect(originPatternForUrl("not a url")).toBeNull();
  });

  it("checks origins through chrome.permissions.contains", async () => {
    const contains = vi.fn(async () => true);
    vi.stubGlobal("chrome", { permissions: { contains } });

    await expect(
      hasOriginPermission("https://api.example.com/items"),
    ).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({
      origins: ["https://api.example.com/*"],
    });
  });

  it("returns false when the permissions API is unavailable", async () => {
    vi.stubGlobal("chrome", undefined);

    await expect(
      hasOriginPermission("https://api.example.com/items"),
    ).resolves.toBe(false);
  });

  it("requests permission only through the explicit helper", async () => {
    const request = vi.fn(async () => true);
    vi.stubGlobal("chrome", { permissions: { request } });

    await expect(
      requestOriginPermission("https://api.example.com/items"),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({
      origins: ["https://api.example.com/*"],
    });
  });

  it("returns false for invalid URLs instead of prompting", async () => {
    await expect(hasOriginPermission("ftp://api.example.com")).resolves.toBe(
      false,
    );
    await expect(requestOriginPermission("nope")).resolves.toBe(false);
  });
});
