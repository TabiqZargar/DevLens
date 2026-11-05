import { describe, expect, it } from "vitest";
import {
  appendRow,
  BODY_CONTENT_TYPES,
  buildQueryString,
  countEnabledRows,
  createRequestDraft,
  createRow,
  HTTP_METHODS,
  isBodyContentType,
  isDraftEmpty,
  isHttpMethod,
  normalizeRows,
  removeRow,
  updateRow,
  validateRequestUrl,
} from "./api-request";

describe("API request model", () => {
  it("exposes the supported methods and body content types", () => {
    expect(HTTP_METHODS).toEqual([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ]);
    expect(BODY_CONTENT_TYPES).toEqual([
      "none",
      "application/json",
      "text/plain",
      "application/x-www-form-urlencoded",
    ]);
  });

  it("creates a predictable default draft", () => {
    const draft = createRequestDraft();

    expect(draft.method).toBe("GET");
    expect(draft.url).toBe("");
    expect(draft.params).toHaveLength(1);
    expect(draft.headers).toHaveLength(1);
    expect(draft.params[0]).toMatchObject({
      key: "",
      value: "",
      enabled: true,
    });
    expect(draft.headers[0]).toMatchObject({
      key: "",
      value: "",
      enabled: true,
    });
    expect(draft.body).toEqual({
      contentType: "none",
      content: "",
    });
    expect(isDraftEmpty(draft)).toBe(true);
  });

  it("creates unique row ids", () => {
    const first = createRow({ key: "a" });
    const second = createRow({ key: "b" });

    expect(first.id).not.toBe(second.id);
    expect(first.enabled).toBe(true);
  });

  it("detects non-empty drafts", () => {
    const base = createRequestDraft();

    expect(isDraftEmpty({ ...base, url: "https://example.com" })).toBe(
      false,
    );
    expect(isDraftEmpty({ ...base, method: "POST" })).toBe(false);
    expect(
      isDraftEmpty({
        ...base,
        params: [createRow({ key: "q" })],
      }),
    ).toBe(false);
    expect(
      isDraftEmpty({
        ...base,
        headers: [createRow({ value: "secret" })],
      }),
    ).toBe(false);
    expect(
      isDraftEmpty({
        ...base,
        body: { contentType: "application/json", content: "{}" },
      }),
    ).toBe(false);
  });

  it("appends, updates, and removes rows immutably", () => {
    const rows = [createRow({ key: "first" })];
    const appended = appendRow(rows);

    expect(appended).toHaveLength(2);
    expect(rows).toHaveLength(1);

    const target = rows[0];
    if (!target) throw new Error("Expected a row.");

    const updated = updateRow(rows, target.id, {
      key: "changed",
      enabled: false,
    });
    expect(updated[0]).toMatchObject({
      key: "changed",
      enabled: false,
    });
    expect(rows[0]?.key).toBe("first");

    expect(removeRow(updated, target.id)).toHaveLength(0);
  });

  it("normalizes only enabled rows with a key", () => {
    const rows = [
      createRow({ key: " a ", value: "1" }),
      createRow({ key: "b", value: "2", enabled: false }),
      createRow({ key: "   ", value: "3" }),
      createRow({ key: "c", value: " 4 " }),
    ];

    expect(normalizeRows(rows)).toEqual([
      { key: "a", value: "1" },
      { key: "c", value: " 4 " },
    ]);
    expect(countEnabledRows(rows)).toBe(2);
  });

  it("builds query strings from enabled rows", () => {
    expect(buildQueryString([])).toBe("");
    expect(
      buildQueryString([createRow({ key: "", value: "ignored" })]),
    ).toBe("");
    expect(
      buildQueryString([
        createRow({ key: "q", value: "dev lens" }),
        createRow({ key: "page", value: "2" }),
        createRow({ key: "off", value: "no", enabled: false }),
      ]),
    ).toBe("?q=dev+lens&page=2");
    expect(
      buildQueryString([
        createRow({ key: "tag", value: "a" }),
        createRow({ key: "tag", value: "b" }),
      ]),
    ).toBe("?tag=a&tag=b");
  });

  it("validates absolute http and https URLs", () => {
    expect(validateRequestUrl("https://api.example.com/users")).toMatchObject(
      {
        ok: true,
      },
    );
    expect(validateRequestUrl("  http://localhost:3000  ")).toMatchObject(
      {
        ok: true,
      },
    );

    expect(validateRequestUrl("")).toEqual({
      ok: false,
      message: "Enter a request URL.",
    });
    expect(validateRequestUrl("api.example.com")).toMatchObject({
      ok: false,
      message: expect.stringContaining("absolute URL"),
    });
    expect(validateRequestUrl("ftp://example.com")).toEqual({
      ok: false,
      message: "Only http:// and https:// URLs are supported.",
    });
    expect(validateRequestUrl("javascript:alert(1)")).toMatchObject({
      ok: false,
    });
  });

  it("guards method and content type values", () => {
    expect(isHttpMethod("PATCH")).toBe(true);
    expect(isHttpMethod("HEAD")).toBe(false);
    expect(isBodyContentType("application/json")).toBe(true);
    expect(isBodyContentType("multipart/form-data")).toBe(false);
  });
});
