import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../../shared/constants";
import type { NetworkEntry } from "./network-model";
import {
  createNetworkHar,
  createNetworkHarFilename,
  serializeNetworkHar,
} from "./network-har";

function makeEntry(
  overrides: Partial<NetworkEntry> = {},
): NetworkEntry {
  return {
    id: "entry-1",
    method: "GET",
    url: "https://api.example.com/items",
    host: "api.example.com",
    status: 200,
    statusText: "OK",
    statusClass: "success",
    resourceType: "fetch",
    startedAt: "2026-01-01T00:00:00.000Z",
    durationMs: 125,
    requestSizeBytes: 0,
    responseSizeBytes: 42,
    requestHeaders: [],
    responseHeaders: [],
    queryParams: [],
    postData: null,
    initiator: null,
    hasResponseContent: false,
    ...overrides,
  };
}

describe("network HAR", () => {
  it("creates a valid empty HAR 1.2 log", () => {
    const har = createNetworkHar({
      entries: [],
      exportedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(har.log.version).toBe("1.2");
    expect(har.log.creator).toEqual({
      name: "DevLens",
      version: APP_VERSION,
    });
    expect(har.log.entries).toEqual([]);
  });

  it("maps request and response data into a HAR entry", () => {
    const har = createNetworkHar({
      entries: [
        makeEntry({
          method: "POST",
          url: "https://api.example.com/items?page=2",
          status: 201,
          statusText: "Created",
          durationMs: 88,
          requestSizeBytes: 17,
          responseSizeBytes: 64,
          requestHeaders: [
            { name: "Accept", value: "application/json" },
          ],
          responseHeaders: [
            {
              name: "Content-Type",
              value: "application/json; charset=utf-8",
            },
            { name: "Location", value: "/items/1" },
          ],
          queryParams: [{ name: "page", value: "2" }],
          postData: {
            mimeType: "application/json",
            text: '{"name":"Ada"}',
            params: [],
          },
        }),
      ],
      exportedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const entry = har.log.entries[0];

    if (!entry) throw new Error("Expected a HAR entry.");

    expect(entry.startedDateTime).toBe("2026-01-01T00:00:00.000Z");
    expect(entry.time).toBe(88);
    expect(entry.request).toMatchObject({
      method: "POST",
      url: "https://api.example.com/items?page=2",
      headers: [{ name: "Accept", value: "application/json" }],
      queryString: [{ name: "page", value: "2" }],
      postData: {
        mimeType: "application/json",
        text: '{"name":"Ada"}',
      },
      headersSize: -1,
      bodySize: 17,
    });
    expect(entry.response).toMatchObject({
      status: 201,
      statusText: "Created",
      headers: [
        {
          name: "Content-Type",
          value: "application/json; charset=utf-8",
        },
        { name: "Location", value: "/items/1" },
      ],
      content: {
        size: 64,
        mimeType: "application/json",
      },
      redirectURL: "/items/1",
      headersSize: -1,
      bodySize: 64,
    });
    expect(entry.response.content).not.toHaveProperty("text");
    expect(entry.cache).toEqual({});
    expect(entry.timings).toEqual({
      send: -1,
      wait: -1,
      receive: -1,
    });
  });

  it("includes only explicitly loaded response bodies", () => {
    const entries = [
      makeEntry({ id: "loaded" }),
      makeEntry({ id: "not-loaded" }),
    ];
    const loadedBodies = new Map([
      ["loaded", { text: '{"ok":true}', truncated: false }],
    ]);
    const har = createNetworkHar({ entries, loadedBodies });

    const loaded = har.log.entries[0];
    const notLoaded = har.log.entries[1];

    if (!loaded || !notLoaded) {
      throw new Error("Expected HAR entries.");
    }

    expect(loaded.response.content).toMatchObject({
      text: '{"ok":true}',
    });
    expect(loaded.response.content).not.toHaveProperty("comment");
    expect(notLoaded.response.content).not.toHaveProperty("text");
  });

  it("marks truncated response bodies", () => {
    const har = createNetworkHar({
      entries: [makeEntry({ id: "truncated" })],
      loadedBodies: new Map([
        ["truncated", { text: "partial", truncated: true }],
      ]),
    });

    expect(har.log.entries[0]?.response.content).toMatchObject({
      text: "partial",
      comment:
        "Response text was truncated to the DevLens export limit.",
    });
  });

  it("falls back gracefully for missing request fields", () => {
    const exportedAt = new Date("2026-02-03T04:05:06.000Z");
    const har = createNetworkHar({
      entries: [
        makeEntry({
          startedAt: null,
          status: null,
          durationMs: null,
          requestSizeBytes: null,
          responseSizeBytes: null,
          responseHeaders: [],
        }),
      ],
      exportedAt,
    });

    const entry = har.log.entries[0];

    if (!entry) throw new Error("Expected a HAR entry.");

    expect(entry.startedDateTime).toBe(exportedAt.toISOString());
    expect(entry.comment).toBe(
      "Original request start time was unavailable; export time was used.",
    );
    expect(entry.time).toBe(-1);
    expect(entry.response.status).toBe(0);
    expect(entry.response.content).toEqual({
      size: -1,
      mimeType: "",
    });
    expect(entry.request.bodySize).toBe(-1);
    expect(entry.response.bodySize).toBe(-1);
  });

  it("serializes to parseable JSON and names the export", () => {
    const har = createNetworkHar({ entries: [makeEntry()] });
    const parsed = JSON.parse(serializeNetworkHar(har)) as unknown;

    expect(parsed).toMatchObject({
      log: {
        version: "1.2",
        entries: [expect.objectContaining({ time: 125 })],
      },
    });
    expect(
      createNetworkHarFilename(
        new Date("2026-01-02T03:04:05.006Z"),
      ),
    ).toBe("devlens-network-20260102T030405Z.har");
  });
});
