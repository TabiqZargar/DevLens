export type JwtJsonValue =
  | string
  | number
  | boolean
  | null
  | JwtJsonValue[]
  | { [key: string]: JwtJsonValue };

export type JwtJsonObject = { [key: string]: JwtJsonValue };

export type JwtErrorCode =
  | "empty"
  | "segments"
  | "base64url"
  | "utf8"
  | "json"
  | "shape"
  | "unknown";

export interface JwtError {
  code: JwtErrorCode;
  message: string;
}

export interface DecodedJwt {
  header: JwtJsonObject;
  payload: JwtJsonObject;
  signature: string;
  signatureBytes: number;
}

export type JwtDecodeResult =
  | { ok: true; decoded: DecodedJwt }
  | { ok: false; error: JwtError };

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

class JwtDecodeFailure extends Error {
  readonly code: JwtErrorCode;

  constructor(code: JwtErrorCode, message: string) {
    super(message);
    this.name = "JwtDecodeFailure";
    this.code = code;
  }
}

function decodeBase64Url(segment: string, label: string): string {
  if (segment.length === 0) {
    throw new JwtDecodeFailure(
      "base64url",
      `${label} segment is empty.`,
    );
  }

  if (
    !BASE64URL_PATTERN.test(segment) ||
    segment.length % 4 === 1
  ) {
    throw new JwtDecodeFailure(
      "base64url",
      `${label} is not valid Base64URL.`,
    );
  }

  const padded =
    segment.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (segment.length % 4)) % 4);

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new JwtDecodeFailure(
      "base64url",
      `${label} is not valid Base64URL.`,
    );
  }

  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JwtDecodeFailure(
      "utf8",
      `${label} segment is not valid UTF-8.`,
    );
  }
}

function parseJsonObject(
  segment: string,
  label: string,
): JwtJsonObject {
  const text = decodeBase64Url(segment, label);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JwtDecodeFailure("json", `${label} is not valid JSON.`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new JwtDecodeFailure(
      "shape",
      `${label} must be a JSON object.`,
    );
  }

  return parsed as JwtJsonObject;
}

function signatureByteLength(segment: string): number {
  return Math.floor((segment.length * 3) / 4);
}

function validateSignature(segment: string): number {
  if (segment.length === 0) return 0;

  if (
    !BASE64URL_PATTERN.test(segment) ||
    segment.length % 4 === 1
  ) {
    throw new JwtDecodeFailure(
      "base64url",
      "Signature is not valid Base64URL.",
    );
  }

  return signatureByteLength(segment);
}

export function decodeJwt(token: string): JwtDecodeResult {
  const trimmed = token.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      error: {
        code: "empty",
        message: "Paste a JWT to inspect.",
      },
    };
  }

  const parts = trimmed.split(".");

  if (parts.length < 3) {
    return {
      ok: false,
      error: {
        code: "segments",
        message:
          "This token is missing segments. A compact JWT has three dot-separated parts.",
      },
    };
  }

  if (parts.length > 3) {
    return {
      ok: false,
      error: {
        code: "segments",
        message:
          "This token has too many segments. A compact JWT has exactly three dot-separated parts.",
      },
    };
  }

  try {
    const header = parseJsonObject(parts[0] ?? "", "Header");
    const payload = parseJsonObject(parts[1] ?? "", "Payload");
    const signature = parts[2] ?? "";

    return {
      ok: true,
      decoded: {
        header,
        payload,
        signature,
        signatureBytes: validateSignature(signature),
      },
    };
  } catch (error) {
    if (error instanceof JwtDecodeFailure) {
      return {
        ok: false,
        error: { code: error.code, message: error.message },
      };
    }

    return {
      ok: false,
      error: {
        code: "unknown",
        message: "The token could not be decoded.",
      },
    };
  }
}
