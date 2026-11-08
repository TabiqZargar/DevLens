import { describe, expect, it } from "vitest";
import { createOllamaChatStreamParser } from "./chat";

function chunk(value: unknown): string {
  return JSON.stringify(value);
}

describe("createOllamaChatStreamParser", () => {
  it("parses deltas and completion across arbitrary chunk boundaries", () => {
    const parser = createOllamaChatStreamParser();
    const source = `${chunk({
      model: "llama3.2",
      message: { role: "assistant", content: "Hello" },
      done: false,
    })}\r\n${chunk({
      model: "llama3.2",
      message: { role: "assistant", content: " there" },
      done: false,
    })}\n${chunk({
      model: "llama3.2",
      message: { role: "assistant", content: "" },
      done: true,
      done_reason: "stop",
    })}\n`;
    const events = [];

    for (let index = 0; index < source.length; index += 7) {
      events.push(...parser.push(source.slice(index, index + 7)));
    }

    events.push(...parser.finish());

    expect(events).toEqual([
      { type: "delta", content: "Hello", model: "llama3.2" },
      { type: "delta", content: " there", model: "llama3.2" },
      {
        type: "done",
        model: "llama3.2",
        doneReason: "stop",
      },
    ]);
  });

  it("flushes a final line that has no trailing newline", () => {
    const parser = createOllamaChatStreamParser();
    const source = chunk({
      message: { role: "assistant", content: "Done" },
      done: true,
    });

    expect(parser.push(source)).toEqual([]);
    expect(parser.finish()).toEqual([
      { type: "delta", content: "Done", model: null },
      { type: "done", model: null, doneReason: null },
    ]);
  });

  it("ignores blank lines and reports malformed or Ollama error events", () => {
    const parser = createOllamaChatStreamParser();

    expect(
      parser.push(
        "\n\r\nnot-json\n" +
          chunk({ error: "model is not installed" }) +
          "\n" +
          chunk({ unexpected: true }) +
          "\n",
      ),
    ).toEqual([
      { type: "malformed" },
      { type: "error" },
      { type: "malformed" },
    ]);
  });

  it("rejects malformed message shapes without throwing", () => {
    const parser = createOllamaChatStreamParser();

    expect(
      parser.push(
        `${chunk({ message: { content: 42 } })}\n` +
          `${chunk({ message: null, done: false })}\n`,
      ),
    ).toEqual([{ type: "malformed" }, { type: "malformed" }]);
  });
});
