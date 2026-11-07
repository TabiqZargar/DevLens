import { describe, expect, it } from "vitest";
import {
  appendNetworkEntry,
  filterNetworkEntries,
  getNetworkStatusClass,
  NETWORK_ENTRY_LIMIT,
  NETWORK_INITIATOR_STACK_LIMIT,
  normalizeNetworkEntry,
  type NetworkEntry,
} from "./network-model";

interface HarEntryOverrides {
  startedDateTime?: string;
  time?: number;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  [key: string]: unknown;
}

function makeHarEntry(
  overrides: HarEntryOverrides = {},
): chrome.devtools.network.Request {
  const {
    startedDateTime = "2026-01-01T00:00:00.000Z",
    time = 125,
    request,
    response,
    ...rest
  } = overrides;

  return {
    startedDateTime,
    time,
    request: {
      method: "GET",
      url: "https://api.example.com/users?page=2",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [{ name: "Accept", value: "application/json" }],
      queryString: [{ name: "page", value: "2" }],
      headersSize: 120,
      bodySize: 0,
      ...request,
    },
    response: {
      status: 200,
      statusText: "OK",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [{ name: "Content-Type", value: "application/json" }],
      content: { size: 42, mimeType: "application/json" },
      redirectURL: "",
      headersSize: 80,
      bodySize: 42,
      ...response,
    },
    cache: {},
    timings: { send: 0, wait: 50, receive: 50 },
    getContent: async () => ({ content: "", encoding: "" }),
    ...rest,
  } as unknown as chrome.devtools.network.Request;
}

describe("network model", () => {
  it("normalizes a completed HAR entry", () => {
    const entry = normalizeNetworkEntry(
      makeHarEntry({ _resourceType: "fetch" }),
    );

    expect(entry).toMatchObject({
      method: "GET",
      url: "https://api.example.com/users?page=2",
      host: "api.example.com",
      status: 200,
      statusText: "OK",
      statusClass: "success",
      resourceType: "fetch",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 125,
      requestSizeBytes: 0,
      responseSizeBytes: 42,
      requestHeaders: [
        { name: "Accept", value: "application/json" },
      ],
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
      ],
      queryParams: [{ name: "page", value: "2" }],
      postData: null,
    });
    expect(entry.id).toEqual(expect.any(String));
  });

  it("normalizes method, post data, and URL query fallback", () => {
    const entry = normalizeNetworkEntry(
      makeHarEntry({
        request: {
          method: "post",
          url: "https://api.example.com/items?tag=a&tag=b",
          queryString: [],
          headers: [],
          postData: {
            mimeType: "application/x-www-form-urlencoded",
            params: [
              { name: "name", value: "Ada" },
              {
                name: "avatar",
                value: "",
                fileName: "ada.png",
                contentType: "image/png",
              },
            ],
          },
        },
      }),
    );

    expect(entry.method).toBe("POST");
    expect(entry.host).toBe("api.example.com");
    expect(entry.queryParams).toEqual([
      { name: "tag", value: "a" },
      { name: "tag", value: "b" },
    ]);
    expect(entry.postData).toEqual({
      mimeType: "application/x-www-form-urlencoded",
      text: null,
      params: [
        {
          name: "name",
          value: "Ada",
          fileName: null,
          contentType: null,
        },
        {
          name: "avatar",
          value: "",
          fileName: "ada.png",
          contentType: "image/png",
        },
      ],
    });
  });

  it("keeps text post data when present", () => {
    const entry = normalizeNetworkEntry(
      makeHarEntry({
        request: {
          postData: {
            mimeType: "application/json",
            text: '{"ok":true}',
          },
        },
      }),
    );

    expect(entry.postData).toEqual({
      mimeType: "application/json",
      text: '{"ok":true}',
      params: [],
    });
  });

  it("normalizes initiator details and bounds the call stack", () => {
    const callFrames = Array.from({ length: 10 }, (_, index) => ({
      functionName: `fn${index}`,
      url: `https://api.example.com/${index}.js`,
      lineNumber: index + 1,
      columnNumber: index + 2,
    }));

    const entry = normalizeNetworkEntry(
      makeHarEntry({
        _initiator: {
          type: "script",
          url: "https://api.example.com/app.js",
          lineNumber: 10,
          columnNumber: 4,
          stack: { callFrames },
        },
      }),
    );

    expect(entry.initiator).toEqual({
      type: "script",
      url: "https://api.example.com/app.js",
      lineNumber: 10,
      columnNumber: 4,
      frames: callFrames.slice(0, NETWORK_INITIATOR_STACK_LIMIT),
    });
    expect(entry.initiator?.frames).toHaveLength(
      NETWORK_INITIATOR_STACK_LIMIT,
    );
  });

  it("uses null for missing or empty initiator information", () => {
    expect(normalizeNetworkEntry(makeHarEntry()).initiator).toBeNull();

    expect(
      normalizeNetworkEntry(
        makeHarEntry({
          _initiator: {
            stack: { callFrames: [] },
          },
        }),
      ).initiator,
    ).toBeNull();
  });

  it("reports whether live content access is available", () => {
    expect(
      normalizeNetworkEntry(makeHarEntry()).hasResponseContent,
    ).toBe(true);

    const withoutContent = makeHarEntry();
    delete (
      withoutContent as unknown as { getContent?: unknown }
    ).getContent;

    expect(
      normalizeNetworkEntry(withoutContent).hasResponseContent,
    ).toBe(false);
  });

  it("uses safe defaults for failed and incomplete entries", () => {
    const failed = normalizeNetworkEntry(
      makeHarEntry({
        startedDateTime: "",
        time: -1,
        _resourceType: "unknown",
        request: {
          method: "get",
          url: "not a url",
          queryString: [],
          headers: [],
          bodySize: -1,
        },
        response: {
          status: 0,
          statusText: "",
          headers: [],
          bodySize: -1,
        },
      }),
    );

    expect(failed).toMatchObject({
      method: "GET",
      url: "not a url",
      host: "",
      status: 0,
      statusText: "",
      statusClass: "failed",
      resourceType: "other",
      startedAt: null,
      durationMs: null,
      requestSizeBytes: null,
      responseSizeBytes: null,
      requestHeaders: [],
      responseHeaders: [],
      queryParams: [],
      postData: null,
    });

    const empty = normalizeNetworkEntry(
      {} as unknown as chrome.devtools.network.Request,
    );

    expect(empty).toMatchObject({
      method: "",
      url: "",
      host: "",
      status: null,
      statusText: "",
      statusClass: "failed",
      resourceType: "other",
      startedAt: null,
      durationMs: null,
      requestSizeBytes: null,
      responseSizeBytes: null,
      requestHeaders: [],
      responseHeaders: [],
      queryParams: [],
      postData: null,
    });
  });

  it("classifies status ranges", () => {
    expect(getNetworkStatusClass(200)).toBe("success");
    expect(getNetworkStatusClass(204)).toBe("success");
    expect(getNetworkStatusClass(301)).toBe("redirect");
    expect(getNetworkStatusClass(304)).toBe("redirect");
    expect(getNetworkStatusClass(404)).toBe("client-error");
    expect(getNetworkStatusClass(500)).toBe("server-error");
    expect(getNetworkStatusClass(0)).toBe("failed");
    expect(getNetworkStatusClass(null)).toBe("failed");
  });

  it("combines search, resource type, and status class filters", () => {
    const entries = [
      normalizeNetworkEntry(
        makeHarEntry({
          _resourceType: "fetch",
          request: {
            method: "GET",
            url: "https://api.example.com/users",
          },
          response: { status: 200 },
        }),
      ),
      normalizeNetworkEntry(
        makeHarEntry({
          _resourceType: "script",
          request: {
            method: "POST",
            url: "https://cdn.example.com/app.js",
          },
          response: { status: 404 },
        }),
      ),
      normalizeNetworkEntry(
        makeHarEntry({
          _resourceType: "xhr",
          request: {
            method: "GET",
            url: "https://api.example.com/redirect",
          },
          response: { status: 302 },
        }),
      ),
      normalizeNetworkEntry(
        makeHarEntry({
          _resourceType: "image",
          request: {
            method: "GET",
            url: "https://img.example.com/logo.png",
          },
          response: { status: 500 },
        }),
      ),
      normalizeNetworkEntry(
        makeHarEntry({
          _resourceType: "other",
          request: {
            method: "GET",
            url: "https://api.example.com/fail",
          },
          response: { status: 0 },
        }),
      ),
    ];

    expect(
      filterNetworkEntries(entries, { search: "api.example.com" }),
    ).toHaveLength(3);
    expect(
      filterNetworkEntries(entries, { search: "EXAMPLE.COM" }),
    ).toHaveLength(5);
    expect(
      filterNetworkEntries(entries, { search: "post" }),
    ).toEqual([entries[1]]);
    expect(
      filterNetworkEntries(entries, { resourceType: "fetch" }),
    ).toEqual([entries[0]]);
    expect(
      filterNetworkEntries(entries, { statusClass: "failed" }),
    ).toEqual([entries[4]]);
    expect(
      filterNetworkEntries(entries, {
        search: "api",
        resourceType: "xhr",
        statusClass: "redirect",
      }),
    ).toEqual([entries[2]]);
    expect(filterNetworkEntries(entries, { search: "   " })).toEqual(
      entries,
    );
  });

  it("deduplicates entries with the same stable identity", () => {
    const first = normalizeNetworkEntry(makeHarEntry());
    const duplicate = normalizeNetworkEntry(makeHarEntry());
    const changed = normalizeNetworkEntry(
      makeHarEntry({
        request: {
          method: "GET",
          url: "https://api.example.com/other",
        },
      }),
    );

    expect(duplicate.id).toBe(first.id);

    const seeded = [first];
    expect(appendNetworkEntry(seeded, duplicate)).toEqual([first]);
    expect(seeded).toEqual([first]);

    expect(appendNetworkEntry(seeded, changed)).toEqual([
      first,
      changed,
    ]);
  });

  it("bounds the collection and evicts the oldest entries", () => {
    const entries = Array.from({ length: 4 }, (_, index) =>
      normalizeNetworkEntry(
        makeHarEntry({
          startedDateTime: `2026-01-01T00:00:0${index}.000Z`,
          request: {
            method: "GET",
            url: `https://api.example.com/${index}`,
          },
        }),
      ),
    );

    const bounded = entries.reduce<NetworkEntry[]>(
      (collection, entry) =>
        appendNetworkEntry(collection, entry, 3),
      [],
    );

    expect(bounded.map((entry) => entry.url)).toEqual([
      "https://api.example.com/1",
      "https://api.example.com/2",
      "https://api.example.com/3",
    ]);
    expect(NETWORK_ENTRY_LIMIT).toBe(1_000);

    const first = entries[0];
    if (!first) throw new Error("Expected a network entry.");
    expect(appendNetworkEntry([first], first, 0)).toEqual([]);
  });
});
