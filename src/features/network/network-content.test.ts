import { describe, expect, it } from "vitest";
import {
  createNetworkBodyPreview,
  createNetworkExportBody,
  getNetworkContentMimeType,
  isBinaryNetworkMimeType,
  isTextualNetworkMimeType,
} from "./network-content";

describe("network content", () => {
  it("reads the response content type without parameters", () => {
    expect(
      getNetworkContentMimeType([
        { name: "content-type", value: "application/json; charset=utf-8" },
        { name: "X-Test", value: "yes" },
      ]),
    ).toBe("application/json");
    expect(getNetworkContentMimeType([])).toBe("");
  });

  it("classifies textual and binary content types", () => {
    expect(isTextualNetworkMimeType("text/plain")).toBe(true);
    expect(isTextualNetworkMimeType("application/ld+json")).toBe(true);
    expect(isTextualNetworkMimeType("image/svg+xml")).toBe(true);
    expect(isBinaryNetworkMimeType("image/png")).toBe(true);
    expect(isBinaryNetworkMimeType("application/octet-stream")).toBe(true);
    expect(isBinaryNetworkMimeType("application/json")).toBe(false);
  });

  it("returns an empty preview for empty content", () => {
    expect(
      createNetworkBodyPreview({
        content: "",
        encoding: null,
        mimeType: "text/plain",
      }),
    ).toEqual({ kind: "empty" });
  });

  it("formats valid JSON", () => {
    const preview = createNetworkBodyPreview({
      content: '{"ok":true}',
      encoding: null,
      mimeType: "application/json",
    });

    expect(preview).toMatchObject({
      kind: "text",
      format: "json",
      truncated: false,
    });

    if (preview.kind !== "text") {
      throw new Error("Expected a text preview.");
    }

    expect(preview.text).toContain('"ok": true');
    expect(preview.text).toContain("\n");
  });

  it("keeps malformed JSON as raw text", () => {
    const preview = createNetworkBodyPreview({
      content: '{"ok":',
      encoding: null,
      mimeType: "application/json",
    });

    expect(preview).toMatchObject({
      kind: "text",
      format: "text",
      text: '{"ok":',
    });
  });

  it("decodes base64 text", () => {
    const preview = createNetworkBodyPreview({
      content: btoa("hello base64"),
      encoding: "base64",
      mimeType: "text/plain",
    });

    expect(preview).toMatchObject({
      kind: "text",
      format: "text",
      text: "hello base64",
      truncated: false,
    });
  });

  it("rejects binary content without rendering it as text", () => {
    expect(
      createNetworkBodyPreview({
        content: "\u0000\u0001PNG",
        encoding: null,
        mimeType: "image/png",
      }),
    ).toMatchObject({
      kind: "unsupported",
      reason: "binary",
    });

    expect(
      createNetworkBodyPreview({
        content: btoa("\u0000\u0001PNG"),
        encoding: "base64",
        mimeType: "",
      }),
    ).toMatchObject({
      kind: "unsupported",
      reason: "binary",
    });
  });

  it("rejects unsupported encodings and invalid base64", () => {
    expect(
      createNetworkBodyPreview({
        content: "hello",
        encoding: "gzip",
        mimeType: "text/plain",
      }),
    ).toMatchObject({
      kind: "unsupported",
      reason: "encoding",
    });

    expect(
      createNetworkBodyPreview({
        content: "not base64!",
        encoding: "base64",
        mimeType: "text/plain",
      }),
    ).toMatchObject({
      kind: "unsupported",
      reason: "encoding",
    });
  });

  it("truncates oversized text previews", () => {
    const preview = createNetworkBodyPreview({
      content: "a".repeat(20),
      encoding: null,
      mimeType: "text/plain",
      limit: 10,
    });

    expect(preview).toMatchObject({
      kind: "text",
      truncated: true,
      text: "a".repeat(10),
    });
  });

  it("truncates oversized base64 previews before decoding", () => {
    const preview = createNetworkBodyPreview({
      content: btoa("a".repeat(200)),
      encoding: "base64",
      mimeType: "text/plain",
      limit: 10,
    });

    expect(preview).toMatchObject({
      kind: "text",
      truncated: true,
    });

    if (preview.kind !== "text") {
      throw new Error("Expected a text preview.");
    }

    expect(preview.text.length).toBeLessThanOrEqual(10);
  });

  it("exports textual response bodies without JSON formatting", () => {
    expect(
      createNetworkExportBody({
        content: '{"ok":true}',
        encoding: null,
        mimeType: "application/json",
      }),
    ).toEqual({
      text: '{"ok":true}',
      truncated: false,
    });
  });

  it("exports decoded base64 bodies within the limit", () => {
    expect(
      createNetworkExportBody({
        content: btoa("hello export"),
        encoding: "base64",
        mimeType: "text/plain",
        limit: 20,
      }),
    ).toEqual({
      text: "hello export",
      truncated: false,
    });
  });

  it("marks truncated export bodies", () => {
    expect(
      createNetworkExportBody({
        content: "a".repeat(20),
        encoding: null,
        mimeType: "text/plain",
        limit: 10,
      }),
    ).toEqual({
      text: "a".repeat(10),
      truncated: true,
    });
  });

  it("does not export empty or unsupported bodies as text", () => {
    expect(
      createNetworkExportBody({
        content: "",
        encoding: null,
        mimeType: "text/plain",
      }),
    ).toEqual({ text: "", truncated: false });

    expect(
      createNetworkExportBody({
        content: btoa("\u0000\u0001PNG"),
        encoding: "base64",
        mimeType: "image/png",
      }),
    ).toBeNull();

    expect(
      createNetworkExportBody({
        content: "hello",
        encoding: "gzip",
        mimeType: "text/plain",
      }),
    ).toBeNull();
  });
});
