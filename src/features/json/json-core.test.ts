import { describe, expect, it } from "vitest";
import {
  formatJson,
  getJsonType,
  minifyJson,
  runJsonAction,
  summarizeJson,
  validateJson,
  type JsonResult,
} from "./json-core";

function parseInput(input: string): unknown {
  return JSON.parse(input) as unknown;
}

function expectSuccess(result: JsonResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected JSON processing to succeed.");
  }
  return result;
}

function expectFailure(result: JsonResult) {
  expect(result.ok).toBe(false);
  if (result.ok || result.error === null) {
    throw new Error("Expected JSON processing to return an error.");
  }
  return result;
}

describe("JSON formatting", () => {
  it("formats simple objects with two-space indentation", () => {
    const input =
      '{"name":"DevLens","stars":42,"active":true,"owner":null}';
    const result = expectSuccess(formatJson(input, 2));

    expect(result.output).toBe(
      '{\n  "name": "DevLens",\n  "stars": 42,\n  "active": true,\n  "owner": null\n}',
    );
    expect(result.value).toEqual(parseInput(input));
  });

  it("formats nested objects with four-space indentation", () => {
    const input = '{"outer":{"inner":{"value":1}},"list":[]}';
    const result = expectSuccess(formatJson(input, 4));

    expect(result.output).toContain('    "outer": {');
    expect(result.output).toContain('        "inner": {');
    expect(result.value).toEqual(parseInput(input));
  });

  it("formats arrays and nested arrays", () => {
    const input = '[1,{"a":[true,null]},"x",[[2,3]]]';
    const result = expectSuccess(formatJson(input));

    expect(result.output).toBe(
      '[\n  1,\n  {\n    "a": [\n      true,\n      null\n    ]\n  },\n  "x",\n  [\n    [\n      2,\n      3\n    ]\n  ]\n]',
    );
    expect(result.value).toEqual(parseInput(input));
  });

  it("formats empty objects and arrays", () => {
    expect(expectSuccess(formatJson("{}")).output).toBe("{}");
    expect(expectSuccess(formatJson("[]")).output).toBe("[]");
  });

  it("preserves string, escaped, and unicode data", () => {
    const input = String.raw`{"escaped":"\u00e9\n\"","emoji":"🚀","text":"keep  spaces"}`;
    const result = expectSuccess(formatJson(input));

    expect(result.value).toEqual(parseInput(input));
    expect(expectSuccess(validateJson(result.output ?? "")).value).toEqual(
      parseInput(input),
    );
    expect(result.output).toContain("🚀");
    expect(result.output).toContain("keep  spaces");
  });

  it("preserves numbers, booleans, and null", () => {
    const input = "[0,-1,3.14,1e3,true,false,null]";
    const result = expectSuccess(formatJson(input));

    expect(result.value).toEqual(parseInput(input));
    expect(expectSuccess(validateJson(result.output ?? "")).value).toEqual(
      parseInput(input),
    );
  });

  it("keeps formatting and parsing equivalent across fixtures", () => {
    const fixtures = [
      "{}",
      "[]",
      '{"a":1}',
      '{"a":{"b":[1,2,{"c":null}]}}',
      '[true,false,null,"text",1.5]',
      String.raw`{"unicode":"日本語","escaped":"line\nbreak","emoji":"🧪"}`,
    ];

    for (const fixture of fixtures) {
      for (const indent of [2, 4] as const) {
        const result = expectSuccess(formatJson(fixture, indent));
        expect(parseInput(result.output ?? "")).toEqual(parseInput(fixture));
      }
    }
  });
});

describe("JSON minification", () => {
  it("removes whitespace while preserving string contents", () => {
    const input = '{ "a" : [ 1 , 2 ] , "b" : "keep  spaces" }';
    const result = expectSuccess(minifyJson(input));

    expect(result.output).toBe('{"a":[1,2],"b":"keep  spaces"}');
    expect(result.value).toEqual(parseInput(input));
  });

  it("handles nested objects and arrays", () => {
    const input = '{\n  "a": {\n    "b": [1, 2, 3]\n  }\n}';
    expect(expectSuccess(minifyJson(input)).output).toBe(
      '{"a":{"b":[1,2,3]}}',
    );
  });

  it("preserves number lexemes, escapes, and duplicate keys exactly", () => {
    const input = String.raw`{ "a": 1e3, "a": 2, "b": -0.0, "c": "\u00e9\n" }`;
    const result = expectSuccess(minifyJson(input));

    expect(result.output).toBe(
      String.raw`{"a":1e3,"a":2,"b":-0.0,"c":"\u00e9\n"}`,
    );
    expect(parseInput(result.output ?? "")).toEqual(parseInput(input));
  });

  it("preserves unicode data", () => {
    const input = '{ "emoji": "🚀", "text": "日本語" }';
    expect(expectSuccess(minifyJson(input)).output).toBe(
      '{"emoji":"🚀","text":"日本語"}',
    );
  });
});

describe("JSON validation", () => {
  it("accepts valid JSON without producing output", () => {
    const result = expectSuccess(validateJson('{"ok":true}'));

    expect(result.output).toBeNull();
    expect(result.value).toEqual({ ok: true });
  });

  it("returns an empty result for empty or whitespace-only input", () => {
    for (const input of ["", "   ", "\n\t\r"]) {
      const result = validateJson(input);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected empty input to fail.");
      expect(result.empty).toBe(true);
      expect(result.error).toBeNull();
    }
  });

  it("reports malformed JSON with safe messages", () => {
    const result = expectFailure(validateJson('{"a": 1,}'));

    expect(result.empty).toBe(false);
    expect(result.error.message).toContain("double-quoted property name");
    expect(result.error.line).toBe(1);
    expect(result.error.column).toBe(9);
    expect(result.error.detail.length).toBeGreaterThan(0);
  });

  it("reports line and column for multiline errors", () => {
    const result = expectFailure(
      validateJson('{\n  "a": 1,\n  "b": 2\n  "c": 3\n}'),
    );

    expect(result.error.line).toBe(4);
    expect(result.error.column).toBe(3);
  });

  it("reports incomplete JSON at the end of the input", () => {
    const result = expectFailure(validateJson('{"a": 1'));

    expect(result.error.message).toContain("incomplete");
    expect(result.error.line).toBe(1);
    expect(result.error.column).toBe(8);
  });

  it("does not crash on unexpected tokens", () => {
    const result = expectFailure(validateJson('{"a": }'));

    expect(result.error.message).toContain("Unexpected token");
  });
});

describe("JSON summaries", () => {
  it("identifies value types", () => {
    expect(getJsonType({})).toBe("object");
    expect(getJsonType([])).toBe("array");
    expect(getJsonType("text")).toBe("string");
    expect(getJsonType(1.5)).toBe("number");
    expect(getJsonType(false)).toBe("boolean");
    expect(getJsonType(null)).toBe("null");
  });

  it("counts nodes and depth", () => {
    expect(summarizeJson({ a: 1, b: [2, 3] })).toEqual({
      nodes: 5,
      depth: 3,
    });
    expect(summarizeJson(null)).toEqual({ nodes: 1, depth: 1 });
    expect(summarizeJson({ empty: {}, list: [] })).toEqual({
      nodes: 3,
      depth: 2,
    });
  });
});

describe("JSON actions", () => {
  it("dispatches format, minify, and validate", () => {
    const input = '{ "a": 1 }';

    expect(expectSuccess(runJsonAction("format", input, 2)).output).toBe(
      '{\n  "a": 1\n}',
    );
    expect(expectSuccess(runJsonAction("minify", input, 2)).output).toBe(
      '{"a":1}',
    );
    expect(expectSuccess(runJsonAction("validate", input, 2)).output).toBeNull();
  });

  it("formats and minifies large JSON without losing data", () => {
    const input = JSON.stringify(
      Array.from({ length: 5_000 }, (_, index) => ({
        id: index,
        name: `item-${index}`,
        tags: ["alpha", "beta"],
        active: index % 2 === 0,
      })),
    );

    const formatted = expectSuccess(formatJson(input));
    const minified = expectSuccess(minifyJson(input));

    expect(parseInput(formatted.output ?? "")).toEqual(parseInput(input));
    expect(parseInput(minified.output ?? "")).toEqual(parseInput(input));
  });
});
