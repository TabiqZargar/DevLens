export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineToken[] }
  | { type: "em"; children: InlineToken[] };

export type MarkdownBlock =
  | {
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      text: string;
    }
  | { type: "paragraph"; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string };

function isWordCharacter(value: string): boolean {
  return /[A-Za-z0-9]/.test(value);
}

export function parseInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let text = "";
  let index = 0;

  function flushText() {
    if (text.length > 0) {
      tokens.push({ type: "text", value: text });
      text = "";
    }
  }

  while (index < source.length) {
    const character = source.charAt(index);

    if (character === "`") {
      const end = source.indexOf("`", index + 1);

      if (end > index + 1) {
        flushText();
        tokens.push({
          type: "code",
          value: source.slice(index + 1, end),
        });
        index = end + 1;
        continue;
      }
    }

    if (source.startsWith("**", index)) {
      const end = source.indexOf("**", index + 2);

      if (end > index + 2) {
        flushText();
        tokens.push({
          type: "strong",
          children: parseInline(source.slice(index + 2, end)),
        });
        index = end + 2;
        continue;
      }
    }

    if (character === "*") {
      const end = source.indexOf("*", index + 1);

      if (end > index + 1) {
        flushText();
        tokens.push({
          type: "em",
          children: parseInline(source.slice(index + 1, end)),
        });
        index = end + 1;
        continue;
      }
    }

    if (character === "_") {
      const end = source.indexOf("_", index + 1);
      const previous = source.charAt(index - 1);
      const next = source.charAt(end + 1);

      if (
        end > index + 1 &&
        !isWordCharacter(previous) &&
        !isWordCharacter(next)
      ) {
        flushText();
        tokens.push({
          type: "em",
          children: parseInline(source.slice(index + 1, end)),
        });
        index = end + 1;
        continue;
      }
    }

    text += character;
    index += 1;
  }

  flushText();
  return tokens;
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    line.trimStart().startsWith("```")
  );
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```(.*)$/);

    if (fence) {
      const language = (fence[1] ?? "").trim().split(/\s+/)[0] ?? "";
      const code: string[] = [];
      index += 1;

      while (index < lines.length) {
        const codeLine = lines[index] ?? "";

        if (/^\s*```/.test(codeLine)) {
          index += 1;
          break;
        }

        code.push(codeLine);
        index += 1;
      }

      blocks.push({
        type: "code",
        language,
        code: code.join("\n"),
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (heading) {
      blocks.push({
        type: "heading",
        level: (heading[1] ?? "#").length as
          | 1
          | 2
          | 3
          | 4
          | 5
          | 6,
        text: heading[2] ?? "",
      });
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length) {
        const item = (lines[index] ?? "").match(
          /^\s*[-*+]\s+(.+)$/,
        );

        if (!item) {
          break;
        }

        items.push(item[1] ?? "");
        index += 1;
      }

      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length) {
        const item = (lines[index] ?? "").match(
          /^\s*\d+[.)]\s+(.+)$/,
        );

        if (!item) {
          break;
        }

        items.push(item[1] ?? "");
        index += 1;
      }

      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];

      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^\s*>\s?(.*)$/);

        if (!item) {
          break;
        }

        quote.push(item[1] ?? "");
        index += 1;
      }

      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;

    while (index < lines.length) {
      const next = lines[index] ?? "";

      if (next.trim().length === 0 || isBlockStart(next)) {
        break;
      }

      paragraph.push(next);
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}
