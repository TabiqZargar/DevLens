export type OllamaChatStreamEvent =
  | {
      type: "delta";
      content: string;
      model: string | null;
    }
  | {
      type: "done";
      model: string | null;
      doneReason: string | null;
    }
  | { type: "error" }
  | { type: "malformed" };

export interface OllamaChatStreamParser {
  push(text: string): OllamaChatStreamEvent[];
  finish(): OllamaChatStreamEvent[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function parseLine(line: string): OllamaChatStreamEvent[] {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [{ type: "malformed" }];
  }

  const record = asRecord(parsed);

  if (!record) {
    return [{ type: "malformed" }];
  }

  if (typeof record.error === "string") {
    return [{ type: "error" }];
  }

  const model =
    typeof record.model === "string" && record.model.length > 0
      ? record.model
      : null;
  const events: OllamaChatStreamEvent[] = [];
  const message = asRecord(record.message);

  if (message && typeof message.content === "string") {
    if (message.content.length > 0) {
      events.push({
        type: "delta",
        content: message.content,
        model,
      });
    }
  } else if (record.done !== true) {
    return [{ type: "malformed" }];
  }

  if (record.done === true) {
    events.push({
      type: "done",
      model,
      doneReason:
        typeof record.done_reason === "string" &&
        record.done_reason.length > 0
          ? record.done_reason
          : null,
    });

    return events;
  }

  return events;
}

export function createOllamaChatStreamParser(): OllamaChatStreamParser {
  let buffer = "";

  function consumeLines(text: string, flush: boolean): OllamaChatStreamEvent[] {
    buffer += text;

    const events: OllamaChatStreamEvent[] = [];
    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      events.push(...parseLine(line));
      newlineIndex = buffer.indexOf("\n");
    }

    if (flush && buffer.length > 0) {
      events.push(...parseLine(buffer.replace(/\r$/, "")));
      buffer = "";
    }

    return events;
  }

  return {
    push(text) {
      return consumeLines(text, false);
    },
    finish() {
      return consumeLines("", true);
    },
  };
}
