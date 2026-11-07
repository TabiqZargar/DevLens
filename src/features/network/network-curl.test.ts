import { describe, expect, it } from "vitest";
import { createCurlCommand } from "./network-curl";
import type { NetworkEntry } from "./network-model";

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

describe("network cURL", () => {
  it("creates a POSIX cURL command with headers and query params", () => {
    expect(
      createCurlCommand(
        makeEntry({
          requestHeaders: [
            { name: "Accept", value: "application/json" },
          ],
          queryParams: [
            { name: "page", value: "2" },
            { name: "tag", value: "docs" },
          ],
        }),
      ),
    ).toEqual({
      ok: true,
      command:
        "curl --request 'GET' 'https://api.example.com/items?page=2&tag=docs' --header 'Accept: application/json'",
    });
  });

  it("includes request payloads and a missing content type", () => {
    expect(
      createCurlCommand(
        makeEntry({
          method: "POST",
          url: "https://api.example.com/search",
          postData: {
            mimeType: "application/json",
            text: '{"q":"it\'s"}',
            params: [],
          },
        }),
      ),
    ).toEqual({
      ok: true,
      command:
        "curl --request 'POST' 'https://api.example.com/search' --header 'Content-Type: application/json' --data-raw '{\"q\":\"it'\\''s\"}'",
    });
  });

  it("does not duplicate an existing content type header", () => {
    const result = createCurlCommand(
      makeEntry({
        method: "POST",
        requestHeaders: [
          { name: "content-type", value: "application/custom" },
        ],
        postData: {
          mimeType: "application/json",
          text: "payload",
          params: [],
        },
      }),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) throw new Error("Expected a cURL command.");

    expect(result.command).toContain(
      "--header 'content-type: application/custom'",
    );
    expect(result.command).not.toContain(
      "--header 'Content-Type: application/json'",
    );
  });

  it("keeps an existing query string instead of appending params again", () => {
    const result = createCurlCommand(
      makeEntry({
        url: "https://api.example.com/items?page=1",
        queryParams: [{ name: "page", value: "2" }],
      }),
    );

    expect(result).toEqual({
      ok: true,
      command:
        "curl --request 'GET' 'https://api.example.com/items?page=1'",
    });
  });

  it("reconstructs URL-encoded form fields when text is unavailable", () => {
    const result = createCurlCommand(
      makeEntry({
        method: "POST",
        postData: {
          mimeType: "application/x-www-form-urlencoded",
          text: null,
          params: [
            {
              name: "full name",
              value: "Ada & Grace",
              fileName: null,
              contentType: null,
            },
          ],
        },
      }),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) throw new Error("Expected a cURL command.");

    expect(result.command).toContain(
      "--data-raw 'full%20name=Ada%20%26%20Grace'",
    );
  });

  it("omits multipart bodies that cannot be reconstructed", () => {
    const result = createCurlCommand(
      makeEntry({
        method: "POST",
        postData: {
          mimeType: "multipart/form-data",
          text: null,
          params: [
            {
              name: "avatar",
              value: "",
              fileName: "avatar.png",
              contentType: "image/png",
            },
          ],
        },
      }),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) throw new Error("Expected a cURL command.");

    expect(result.command).not.toContain("--data-raw");
  });

  it("omits empty payloads and supports unusual methods", () => {
    const result = createCurlCommand(
      makeEntry({
        method: "DELETE",
        postData: {
          mimeType: "text/plain",
          text: "",
          params: [],
        },
      }),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) throw new Error("Expected a cURL command.");

    expect(result.command).toContain("--request 'DELETE'");
    expect(result.command).not.toContain("--data-raw");
  });

  it("rejects requests without a URL", () => {
    expect(createCurlCommand(makeEntry({ url: "" }))).toEqual({
      ok: false,
      reason: "missing-url",
    });
  });
});
