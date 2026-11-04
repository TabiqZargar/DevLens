export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonIndent = 2 | 4;

export type JsonType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

export type JsonAction = "format" | "minify" | "validate";

export interface JsonSummary {
  nodes: number;
  depth: number;
}

export interface JsonError {
  message: string;
  detail: string;
  offset: number | null;
  line: number | null;
  column: number | null;
}

export interface JsonSuccess {
  ok: true;
  value: JsonValue;
  output: string | null;
  summary: JsonSummary;
}

export interface JsonEmpty {
  ok: false;
  empty: true;
  error: null;
}

export interface JsonFailure {
  ok: false;
  empty: false;
  error: JsonError;
}

export type JsonResult = JsonSuccess | JsonEmpty | JsonFailure;

interface Location {
  offset: number;
  line: number;
  column: number;
}

function locate(input: string, offset: number): Location {
  const clamped = Math.max(0, Math.min(offset, input.length));
  const lines = input.slice(0, clamped).split("\n");

  return {
    offset: clamped,
    line: lines.length,
    column: (lines[lines.length - 1] ?? "").length + 1,
  };
}

function errorLocation(
  input: string,
  detail: string,
): Partial<Pick<JsonError, "offset" | "line" | "column">> {
  const withCoordinates =
    /at position (\d+) \(line (\d+) column (\d+)\)/i.exec(detail);
  if (withCoordinates) {
    const offset = Number(withCoordinates[1]);
    const line = Number(withCoordinates[2]);
    const column = Number(withCoordinates[3]);
    if (
      Number.isSafeInteger(offset) &&
      Number.isSafeInteger(line) &&
      Number.isSafeInteger(column)
    ) {
      return { offset, line, column };
    }
  }

  const position = /at position (\d+)/i.exec(detail);
  if (position) {
    const offset = Number(position[1]);
    if (Number.isSafeInteger(offset)) {
      return locate(input, offset);
    }
  }

  if (/unexpected end of json input/i.test(detail)) {
    return locate(input, input.length);
  }

  return { offset: null, line: null, column: null };
}

function friendlyMessage(detail: string, atEnd: boolean): string {
  if (/unexpected end of json input/i.test(detail)) {
    return "Unexpected end of input. The JSON may be incomplete.";
  }

  if (/maximum call stack size exceeded/i.test(detail)) {
    return "This payload is nested too deeply to process.";
  }

  if (/unterminated string/i.test(detail)) {
    return "Unterminated string. Add a closing double quote.";
  }

  if (atEnd && /expected/i.test(detail)) {
    return "Unexpected end of input. The JSON may be incomplete.";
  }

  const token = /unexpected token '([^']*)'/i.exec(detail)?.[1];
  if (token !== undefined) {
    return `Unexpected token '${token}'. Check for a missing comma, quote, or closing bracket.`;
  }

  if (/expected double-quoted property name/i.test(detail)) {
    return "Expected a double-quoted property name. Object keys must be strings.";
  }

  if (/expected ',' or '}' after property value/i.test(detail)) {
    return "Expected ',' or '}' after a property value.";
  }

  if (/expected ',' or ']' after array element/i.test(detail)) {
    return "Expected ',' or ']' after an array element.";
  }

  if (/expected ':' after property name/i.test(detail)) {
    return "Expected ':' after a property name.";
  }

  if (/expected property name or '}'/i.test(detail)) {
    return "Expected a property name or '}'.";
  }

  if (/unexpected non-whitespace character after json/i.test(detail)) {
    return "Unexpected content after the JSON value.";
  }

  const cleaned = detail
    .replace(/\s+in JSON at position[^,]*/i, "")
    .replace(/,\s+[\s\S]*is not valid JSON$/i, "")
    .trim();

  return cleaned.length > 0 ? cleaned : "Invalid JSON.";
}

function describeError(input: string, error: unknown): JsonError {
  const detail = error instanceof Error ? error.message : String(error);
  const location = errorLocation(input, detail);

  return {
    message: friendlyMessage(detail, location.offset === input.length),
    detail,
    offset: location.offset ?? null,
    line: location.line ?? null,
    column: location.column ?? null,
  };
}

function parseValue(input: string): JsonResult {
  if (input.trim().length === 0) {
    return { ok: false, empty: true, error: null };
  }

  try {
    const value = JSON.parse(input) as JsonValue;
    return {
      ok: true,
      value,
      output: null,
      summary: summarizeJson(value),
    };
  } catch (error) {
    return { ok: false, empty: false, error: describeError(input, error) };
  }
}

function stringifyError(): JsonFailure {
  return {
    ok: false,
    empty: false,
    error: {
      message: "This payload is nested too deeply to format.",
      detail: "JSON.stringify exceeded the call stack.",
      offset: null,
      line: null,
      column: null,
    },
  };
}

function stripWhitespace(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const character of input) {
    if (inString) {
      output += character;

      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    if (
      character === " " ||
      character === "\t" ||
      character === "\n" ||
      character === "\r"
    ) {
      continue;
    }

    output += character;
  }

  return output;
}

export function getJsonType(value: JsonValue): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";

  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "object";
  }
}

export function summarizeJson(value: JsonValue): JsonSummary {
  const stack: Array<{ value: JsonValue; depth: number }> = [
    { value, depth: 1 },
  ];
  let nodes = 0;
  let depth = 0;

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) continue;

    nodes += 1;
    depth = Math.max(depth, entry.depth);

    if (Array.isArray(entry.value)) {
      for (const child of entry.value) {
        stack.push({ value: child, depth: entry.depth + 1 });
      }
    } else if (entry.value !== null && typeof entry.value === "object") {
      for (const child of Object.values(entry.value)) {
        stack.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }

  return { nodes, depth };
}

export function validateJson(input: string): JsonResult {
  return parseValue(input);
}

export function formatJson(input: string, indent: JsonIndent = 2): JsonResult {
  const parsed = parseValue(input);
  if (!parsed.ok) return parsed;

  try {
    const output: unknown = JSON.stringify(parsed.value, null, indent);
    if (typeof output !== "string") return stringifyError();
    return {
      ok: true,
      value: parsed.value,
      output,
      summary: parsed.summary,
    };
  } catch {
    return stringifyError();
  }
}

export function minifyJson(input: string): JsonResult {
  const parsed = parseValue(input);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    value: parsed.value,
    output: stripWhitespace(input),
    summary: parsed.summary,
  };
}

export function runJsonAction(
  action: JsonAction,
  input: string,
  indent: JsonIndent = 2,
): JsonResult {
  if (action === "format") return formatJson(input, indent);
  if (action === "minify") return minifyJson(input);
  return validateJson(input);
}
