import { describe, expect, it } from "vitest";
import {
  parseOllamaTags,
  validateOllamaEndpoint,
} from "./ollama";

describe("validateOllamaEndpoint", () => {
  it("accepts loopback endpoints and removes a trailing slash", () => {
    expect(
      validateOllamaEndpoint(" http://127.0.0.1:11434/ "),
    ).toEqual({
      ok: true,
      endpoint: "http://127.0.0.1:11434",
      origin: "http://127.0.0.1:11434",
    });
    expect(validateOllamaEndpoint("http://localhost:11434")).toEqual({
      ok: true,
      endpoint: "http://localhost:11434",
      origin: "http://localhost:11434",
    });
    expect(validateOllamaEndpoint("https://[::1]:11434")).toEqual({
      ok: true,
      endpoint: "https://[::1]:11434",
      origin: "https://[::1]:11434",
    });
  });

  it("rejects empty, malformed, and non-HTTP endpoints", () => {
    expect(validateOllamaEndpoint("").ok).toBe(false);
    expect(validateOllamaEndpoint("not a url").ok).toBe(false);
    expect(
      validateOllamaEndpoint("ftp://127.0.0.1:11434").ok,
    ).toBe(false);
  });

  it("rejects remote and credential-bearing endpoints", () => {
    expect(
      validateOllamaEndpoint("https://api.example.com/v1").ok,
    ).toBe(false);
    expect(
      validateOllamaEndpoint("http://localhost.example.com:11434")
        .ok,
    ).toBe(false);
    expect(
      validateOllamaEndpoint("http://user:secret@localhost:11434")
        .ok,
    ).toBe(false);
  });

  it("rejects paths, queries, and fragments", () => {
    expect(
      validateOllamaEndpoint("http://localhost:11434/api/tags").ok,
    ).toBe(false);
    expect(
      validateOllamaEndpoint("http://localhost:11434?token=1").ok,
    ).toBe(false);
    expect(
      validateOllamaEndpoint("http://localhost:11434#models").ok,
    ).toBe(false);
  });
});

describe("parseOllamaTags", () => {
  it("maps installed models and optional metadata", () => {
    expect(
      parseOllamaTags({
        models: [
          {
            name: "llama3.2:latest",
            size: 2_019_393_189,
            modified_at: "2026-10-01T12:00:00Z",
            details: {
              parameter_size: "3.2B",
              quantization_level: "Q4_K_M",
            },
          },
          {
            name: "qwen2.5-coder:7b",
          },
        ],
      }),
    ).toEqual([
      {
        name: "llama3.2:latest",
        sizeBytes: 2_019_393_189,
        modifiedAt: "2026-10-01T12:00:00Z",
        parameterSize: "3.2B",
        quantizationLevel: "Q4_K_M",
      },
      { name: "qwen2.5-coder:7b" },
    ]);
  });

  it("accepts an empty model list", () => {
    expect(parseOllamaTags({ models: [] })).toEqual([]);
  });

  it("deduplicates repeated model names", () => {
    expect(
      parseOllamaTags({
        models: [{ name: "llama3.2" }, { name: "llama3.2" }],
      }),
    ).toEqual([{ name: "llama3.2" }]);
  });

  it("rejects malformed responses", () => {
    expect(parseOllamaTags(null)).toBeNull();
    expect(parseOllamaTags({})).toBeNull();
    expect(parseOllamaTags({ models: "llama3.2" })).toBeNull();
    expect(parseOllamaTags({ models: [{}] })).toBeNull();
    expect(parseOllamaTags({ models: [{ name: "  " }] })).toBeNull();
    expect(parseOllamaTags({ models: ["llama3.2"] })).toBeNull();
  });
});
