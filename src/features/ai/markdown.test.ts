import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, lists, quotes, and fenced code", () => {
    expect(
      parseMarkdown(
        [
          "# Title",
          "",
          "First line",
          "second line",
          "",
          "- one",
          "- **two**",
          "",
          "1. first",
          "2. second",
          "",
          "> note",
          "",
          "```ts",
          "const value = 1;",
          "```",
        ].join("\n"),
      ),
    ).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "First line\nsecond line" },
      { type: "list", ordered: false, items: ["one", "**two**"] },
      { type: "list", ordered: true, items: ["first", "second"] },
      { type: "quote", text: "note" },
      {
        type: "code",
        language: "ts",
        code: "const value = 1;",
      },
    ]);
  });

  it("renders an unclosed code fence through the end of the message", () => {
    expect(parseMarkdown("```js\nconst x = 1;")).toEqual([
      { type: "code", language: "js", code: "const x = 1;" },
    ]);
  });

  it("normalizes CRLF input", () => {
    expect(parseMarkdown("# One\r\n\r\nText")).toEqual([
      { type: "heading", level: 1, text: "One" },
      { type: "paragraph", text: "Text" },
    ]);
  });
});

describe("parseInline", () => {
  it("parses inline code, strong, and emphasis", () => {
    expect(
      parseInline("Use `code`, **bold**, *italic*, and _also italic_."),
    ).toEqual([
      { type: "text", value: "Use " },
      { type: "code", value: "code" },
      { type: "text", value: ", " },
      {
        type: "strong",
        children: [{ type: "text", value: "bold" }],
      },
      { type: "text", value: ", " },
      {
        type: "em",
        children: [{ type: "text", value: "italic" }],
      },
      { type: "text", value: ", and " },
      {
        type: "em",
        children: [{ type: "text", value: "also italic" }],
      },
      { type: "text", value: "." },
    ]);
  });

  it("leaves underscores inside words and unmatched markers as text", () => {
    expect(parseInline("snake_case_name and *unclosed")).toEqual([
      { type: "text", value: "snake_case_name and *unclosed" },
    ]);
  });
});
