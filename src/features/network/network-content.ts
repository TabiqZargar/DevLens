import { formatJson } from "../json/json-core";
import type { NetworkHeader } from "./network-model";

export const NETWORK_BODY_PREVIEW_LIMIT_BYTES = 1_048_576;

export type NetworkBodyPreview =
  | { kind: "empty" }
  | {
      kind: "text";
      text: string;
      format: "json" | "text";
      truncated: boolean;
      mimeType: string;
    }
  | {
      kind: "unsupported";
      reason: "binary" | "encoding" | "unknown";
      mimeType: string;
      message: string;
    };

export interface NetworkBodyPreviewInput {
  content: string;
  encoding: string | null;
  mimeType: string;
  limit?: number;
}

export function getNetworkContentMimeType(
  headers: readonly NetworkHeader[],
): string {
  for (const header of headers) {
    if (header.name.toLowerCase() !== "content-type") continue;

    const value = header.value.split(";")[0]?.trim().toLowerCase() ?? "";
    return value;
  }

  return "";
}

export function isTextualNetworkMimeType(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();

  if (mime.length === 0) return false;
  if (mime.startsWith("text/")) return true;

  return (
    mime === "application/json" ||
    mime.endsWith("+json") ||
    mime === "application/xml" ||
    mime.endsWith("+xml") ||
    mime === "application/javascript" ||
    mime === "application/ecmascript" ||
    mime === "application/x-javascript" ||
    mime === "application/x-www-form-urlencoded" ||
    mime === "application/graphql" ||
    mime === "application/sql" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml"
  );
}

export function isBinaryNetworkMimeType(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();

  if (mime.length === 0 || isTextualNetworkMimeType(mime)) {
    return false;
  }

  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("audio/")) return true;
  if (mime.startsWith("video/")) return true;
  if (mime.startsWith("font/")) return true;

  return (
    mime === "application/octet-stream" ||
    mime === "application/pdf" ||
    mime === "application/zip" ||
    mime === "application/gzip" ||
    mime === "application/wasm" ||
    mime === "application/x-protobuf" ||
    mime === "application/vnd.google.protobuf"
  );
}

function looksBinary(text: string): boolean {
  if (text.includes("\u0000")) return true;

  const sample = text.slice(0, 2_048);
  if (sample.length === 0) return false;

  let controlCount = 0;

  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);

    if (
      (code < 9 || (code > 13 && code < 32) || code === 127) &&
      code !== 0
    ) {
      controlCount += 1;
    }
  }

  return controlCount > sample.length * 0.1;
}

function decodedBase64ByteLength(content: string): number {
  const padding = content.endsWith("==")
    ? 2
    : content.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((content.length * 3) / 4) - padding);
}

function decodeBase64(
  content: string,
  limit: number,
): { bytes: Uint8Array; truncated: boolean } | null {
  let source = /\s/.test(content)
    ? content.replace(/\s+/g, "")
    : content;

  const truncated = decodedBase64ByteLength(source) > limit;

  if (truncated) {
    const maxCharacters = Math.ceil(limit / 3) * 4;
    const slice = source.slice(0, maxCharacters);
    source = slice.slice(0, slice.length - (slice.length % 4));
  }

  try {
    const binary = atob(source);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index) & 0xff;
    }

    return { bytes, truncated };
  } catch {
    return null;
  }
}

function decodeBytes(
  bytes: Uint8Array,
  fatal: boolean,
): string | null {
  try {
    return new TextDecoder("utf-8", { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

function looksLikeJson(text: string, mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  const trimmed = text.trim();

  return (
    mime === "application/json" ||
    mime.endsWith("+json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[")
  );
}

function unsupported(
  reason: "binary" | "encoding" | "unknown",
  mimeType: string,
): NetworkBodyPreview {
  const label = mimeType.length > 0 ? ` (${mimeType})` : "";

  if (reason === "binary") {
    return {
      kind: "unsupported",
      reason,
      mimeType,
      message: `Binary response${label} cannot be displayed as text.`,
    };
  }

  if (reason === "encoding") {
    return {
      kind: "unsupported",
      reason,
      mimeType,
      message: "The response uses an unsupported text encoding.",
    };
  }

  return {
    kind: "unsupported",
    reason,
    mimeType,
    message: `Response content${label} cannot be displayed as text.`,
  };
}

function textPreview(
  text: string,
  mimeType: string,
  truncated: boolean,
  limit: number,
): NetworkBodyPreview {
  if (text.trim().length === 0) {
    return { kind: "empty" };
  }

  let output = text;
  let format: "json" | "text" = "text";
  let isTruncated = truncated;

  if (!isTruncated && looksLikeJson(output, mimeType)) {
    const formatted = formatJson(output);

    if (
      formatted.ok &&
      typeof formatted.output === "string" &&
      formatted.output.length > 0
    ) {
      output = formatted.output;
      format = "json";
    }
  }

  if (output.length > limit) {
    output = output.slice(0, limit);
    isTruncated = true;
  }

  return {
    kind: "text",
    text: output,
    format,
    truncated: isTruncated,
    mimeType,
  };
}

type NetworkTextResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: "binary" | "encoding" | "unknown" };

export interface NetworkExportBody {
  text: string;
  truncated: boolean;
}

function readNetworkText({
  content,
  encoding,
  mimeType,
  limit = NETWORK_BODY_PREVIEW_LIMIT_BYTES,
}: NetworkBodyPreviewInput): NetworkTextResult {
  const mime = mimeType.toLowerCase();
  const normalizedLimit = Math.max(0, Math.floor(limit));
  const normalizedEncoding = encoding?.toLowerCase() ?? "";

  if (content.length === 0) {
    return { ok: true, text: "", truncated: false };
  }

  if (normalizedEncoding.length > 0 && normalizedEncoding !== "base64") {
    return { ok: false, reason: "encoding" };
  }

  if (normalizedEncoding === "base64") {
    if (isBinaryNetworkMimeType(mime)) {
      return { ok: false, reason: "binary" };
    }

    const decoded = decodeBase64(content, normalizedLimit);

    if (decoded === null) {
      return { ok: false, reason: "encoding" };
    }

    const knownText = isTextualNetworkMimeType(mime);
    let text = decodeBytes(
      decoded.bytes,
      !knownText && !decoded.truncated,
    );

    if (text === null || looksBinary(text)) {
      return { ok: false, reason: "binary" };
    }

    let truncated = decoded.truncated;

    if (text.length > normalizedLimit) {
      text = text.slice(0, normalizedLimit);
      truncated = true;
    }

    return { ok: true, text, truncated };
  }

  if (isBinaryNetworkMimeType(mime)) {
    return { ok: false, reason: "binary" };
  }

  const truncated = content.length > normalizedLimit;
  const text = truncated ? content.slice(0, normalizedLimit) : content;

  if (looksBinary(text)) {
    return { ok: false, reason: "binary" };
  }

  return { ok: true, text, truncated };
}

export function createNetworkExportBody(
  input: NetworkBodyPreviewInput,
): NetworkExportBody | null {
  const result = readNetworkText(input);

  return result.ok
    ? { text: result.text, truncated: result.truncated }
    : null;
}

export function createNetworkBodyPreview({
  content,
  encoding,
  mimeType,
  limit = NETWORK_BODY_PREVIEW_LIMIT_BYTES,
}: NetworkBodyPreviewInput): NetworkBodyPreview {
  const mime = mimeType.toLowerCase();
  const normalizedLimit = Math.max(0, Math.floor(limit));
  const result = readNetworkText({
    content,
    encoding,
    mimeType: mime,
    limit: normalizedLimit,
  });

  if (!result.ok) {
    return unsupported(result.reason, mime);
  }

  return textPreview(
    result.text,
    mime,
    result.truncated,
    normalizedLimit,
  );
}
