import { describe, expect, it } from "vitest";
import { decodeJwt, type JwtDecodeResult } from "./jwt-core";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toBase64UrlBytes(bytes: readonly number[]): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encode(value: unknown): string {
  return toBase64Url(JSON.stringify(value));
}

const SIGNATURE = toBase64Url("signature");

function makeToken(
  header: unknown = { alg: "RS256", typ: "JWT" },
  payload: unknown = { sub: "user-1" },
  signature: string = SIGNATURE,
): string {
  return `${encode(header)}.${encode(payload)}.${signature}`;
}

function expectError(
  result: JwtDecodeResult,
  code: string,
): asserts result is Extract<JwtDecodeResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected JWT decoding to fail.");
  expect(result.error.code).toBe(code);
}

describe("JWT decoding", () => {
  it("decodes a valid three-segment token", () => {
    const token = makeToken(
      { alg: "RS256", typ: "JWT" },
      { sub: "user-1", admin: true },
    );
    const result = decodeJwt(token);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a decoded token.");

    expect(result.decoded.header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(result.decoded.payload).toEqual({
      sub: "user-1",
      admin: true,
    });
    expect(result.decoded.signature).toBe(SIGNATURE);
    expect(result.decoded.signatureBytes).toBe(9);
  });

  it("ignores surrounding whitespace", () => {
    const token = `  \n${makeToken()}\t `;
    const result = decodeJwt(token);

    expect(result.ok).toBe(true);
  });

  it("rejects empty input", () => {
    for (const input of ["", "   ", "\n\t"]) {
      expectError(decodeJwt(input), "empty");
    }
  });

  it("rejects tokens with missing segments", () => {
    expectError(decodeJwt("abc"), "segments");
    expectError(decodeJwt(`${encode({ alg: "none" })}.${encode({})}`), "segments");
  });

  it("rejects tokens with too many segments", () => {
    expectError(
      decodeJwt(`${makeToken()}.extra`),
      "segments",
    );
  });

  it("rejects invalid Base64URL", () => {
    const headerError = decodeJwt(`%%%.${encode({})}.${SIGNATURE}`);
    expectError(headerError, "base64url");
    expect(headerError.error.message).toContain("Header");

    expectError(
      decodeJwt(`a.${encode({})}.${SIGNATURE}`),
      "base64url",
    );

    expectError(
      decodeJwt(`${encode({})}.%%%.${SIGNATURE}`),
      "base64url",
    );
  });

  it("rejects invalid UTF-8 segments", () => {
    const token = `${toBase64UrlBytes([0xff])}.${encode({})}.${SIGNATURE}`;
    const result = decodeJwt(token);

    expectError(result, "utf8");
    expect(result.error.message).toContain("Header");
  });

  it("rejects invalid JSON header and payload", () => {
    const badHeader = `${toBase64Url("{")}.${encode({})}.${SIGNATURE}`;
    const headerError = decodeJwt(badHeader);
    expectError(headerError, "json");
    expect(headerError.error.message).toContain("Header");

    const badPayload = `${encode({ alg: "none" })}.${toBase64Url("[")}.${SIGNATURE}`;
    const payloadError = decodeJwt(badPayload);
    expectError(payloadError, "json");
    expect(payloadError.error.message).toContain("Payload");
  });

  it("rejects non-object header and payload values", () => {
    expectError(decodeJwt(makeToken([1, 2], {})), "shape");
    expectError(decodeJwt(makeToken({ alg: "none" }, "text")), "shape");
    expectError(decodeJwt(makeToken({ alg: "none" }, null)), "shape");
  });

  it("preserves Unicode header and payload values", () => {
    const token = makeToken(
      { typ: "JWT", note: "clé" },
      { name: "Ada 🚀", phrase: "日本語", nested: ["é", "ß"] },
    );
    const result = decodeJwt(token);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a decoded token.");
    expect(result.decoded.header).toEqual({
      typ: "JWT",
      note: "clé",
    });
    expect(result.decoded.payload).toEqual({
      name: "Ada 🚀",
      phrase: "日本語",
      nested: ["é", "ß"],
    });
  });

  it("accepts an empty signature segment without treating it as verified", () => {
    const token = `${encode({ alg: "none" })}.${encode({ sub: "a" })}.`;
    const result = decodeJwt(token);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a decoded token.");
    expect(result.decoded.signature).toBe("");
    expect(result.decoded.signatureBytes).toBe(0);
  });

  it("rejects invalid signature Base64URL", () => {
    const result = decodeJwt(
      `${encode({ alg: "none" })}.${encode({})}.%%%`,
    );

    expectError(result, "base64url");
    expect(result.error.message).toContain("Signature");
  });

  it("does not assume or verify a signing algorithm", () => {
    for (const alg of ["HS256", "RS256", "ES256", "EdDSA", "none"]) {
      const result = decodeJwt(makeToken({ alg }, { sub: alg }));

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected a decoded token.");
      expect(result.decoded.header.alg).toBe(alg);
    }
  });

  it("never throws on malformed input", () => {
    const malformed = [
      "",
      ".",
      "..",
      "a.b.c",
      "a.b.c.d",
      "%%%.%%%.%%%",
      "eyJhbGciOiJub25lIn0",
      `${encode({})}.${encode({})}.${SIGNATURE}`,
    ];

    for (const token of malformed) {
      expect(() => decodeJwt(token)).not.toThrow();
    }
  });
});
