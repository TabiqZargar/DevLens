import { describe, expect, it } from "vitest";
import {
  buildResponseBodyView,
  formatResponseStatus,
  isJsonContentType,
  responseStatusVariant,
} from "./api-response";

describe("API response formatting", () => {
  it("treats empty and whitespace-only bodies as empty", () => {
    expect(buildResponseBodyView("", "application/json")).toEqual({
      kind: "empty",
    });
    expect(buildResponseBodyView("  \n\t ", "text/plain")).toEqual({
      kind: "empty",
    });
  });

  it("formats valid JSON responses with two-space indentation", () => {
    expect(
      buildResponseBodyView(
        '{"name":"devlens","count":2}',
        "application/json; charset=utf-8",
      ),
    ).toEqual({
      kind: "json",
      text: '{\n  "name": "devlens",\n  "count": 2\n}',
    });
  });

  it("recognizes structured JSON media types", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("APPLICATION/PROBLEM+JSON; charset=utf-8")).toBe(
      true,
    );
    expect(isJsonContentType("text/json")).toBe(true);
    expect(isJsonContentType("application/xml")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });

  it("falls back to raw text for malformed JSON", () => {
    expect(
      buildResponseBodyView("{oops", "application/json"),
    ).toEqual({
      kind: "text",
      text: "{oops",
      note: "Showing raw text because the body is not valid JSON.",
    });
  });

  it("keeps non-JSON bodies as text without a note", () => {
    expect(
      buildResponseBodyView("<html>hello</html>", "text/html"),
    ).toEqual({
      kind: "text",
      text: "<html>hello</html>",
      note: null,
    });
  });

  it("formats status labels and tones", () => {
    expect(formatResponseStatus(200, "OK")).toBe("200 OK");
    expect(formatResponseStatus(204, "  ")).toBe("204");
    expect(responseStatusVariant(201)).toBe("success");
    expect(responseStatusVariant(404)).toBe("warning");
    expect(responseStatusVariant(302)).toBe("neutral");
  });
});
