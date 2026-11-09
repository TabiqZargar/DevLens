import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAiChat } from "./LocalAiChat";

const ENDPOINT = "http://127.0.0.1:11434";

function chatLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function staticResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      },
    }),
    { status: 200 },
  );
}

function controlledResponse() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null =
    null;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(nextController) {
        controller = nextController;
      },
    }),
    { status: 200 },
  );

  return {
    response,
    push(value: unknown) {
      controller?.enqueue(encoder.encode(chatLine(value)));
    },
  };
}

function stubChrome(
  options: { permitted?: boolean; grant?: boolean } = {},
) {
  const contains = vi.fn(async () => options.permitted ?? true);
  const request = vi.fn(async () => options.grant ?? true);

  vi.stubGlobal("chrome", {
    permissions: { contains, request },
  });

  return { contains, request };
}

function renderChat(
  props: {
    endpoint?: string | null;
    model?: string | null;
    unavailableReason?: string | null;
  } = {},
) {
  const onBusyChange = vi.fn();

  render(
    <LocalAiChat
      endpoint={props.endpoint === undefined ? ENDPOINT : props.endpoint}
      model={props.model === undefined ? "llama3.2" : props.model}
      unavailableReason={props.unavailableReason ?? null}
      onBusyChange={onBusyChange}
    />,
  );

  return { onBusyChange };
}

function composer(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "Message" });
}

function sendButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: "Send",
  }) as HTMLButtonElement;
}

interface SentMessage {
  role: string;
  content: string;
}

function sentMessages(
  fetchMock: ReturnType<typeof vi.fn>,
): SentMessage[] {
  const call = fetchMock.mock.calls[0];
  const init = (call?.[1] ?? {}) as RequestInit;
  const body = JSON.parse(String(init.body)) as {
    messages: SentMessage[];
  };

  return body.messages;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, "clipboard");
});

describe("LocalAiChat", () => {
  it("keeps chat disabled with an explicit reason", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderChat({
      endpoint: null,
      model: null,
      unavailableReason: "Select an installed model to start chatting.",
    });

    expect(
      screen.getByText("Select an installed model to start chatting."),
    ).toBeInTheDocument();
    expect(composer()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams a response, copies it, and clears the conversation", async () => {
    stubChrome();
    const writeText = vi.fn(async () => undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const stream = controlledResponse();
    const fetchMock = vi.fn(async () => stream.response);
    vi.stubGlobal("fetch", fetchMock);
    const { onBusyChange } = renderChat();

    fireEvent.change(composer(), {
      target: { value: "Explain lenses" },
    });
    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(onBusyChange).toHaveBeenCalledWith(true);

    stream.push({
      model: "llama3.2",
      message: { role: "assistant", content: "A lens " },
      done: false,
    });

    expect(await screen.findByText("A lens")).toBeInTheDocument();
    expect(screen.getByText("Generating…")).toBeInTheDocument();

    stream.push({
      model: "llama3.2",
      message: { role: "assistant", content: "focuses light." },
      done: false,
    });
    stream.push({
      model: "llama3.2",
      message: { role: "assistant", content: "" },
      done: true,
    });

    await waitFor(() => {
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });
    expect(
      screen.getByText("A lens focuses light."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ENDPOINT}/api/chat`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "llama3.2",
          messages: [{ role: "user", content: "Explain lenses" }],
          stream: true,
        }),
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy response" }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "A lens focuses light.",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText("Explain lenses")).not.toBeInTheDocument();
    expect(
      screen.getByText("Start a local developer session"),
    ).toBeInTheDocument();
  });

  it("attaches explicit code and a selected template", async () => {
    stubChrome();
    const fetchMock = vi.fn(async () =>
      staticResponse([
        chatLine({
          message: { role: "assistant", content: "Explained" },
          done: false,
        }),
        chatLine({ done: true }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderChat();

    fireEvent.click(
      screen.getByRole("button", { name: "Explain code" }),
    );
    expect(sendButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Code"), {
      target: {
        value: "const total = items.reduce((sum, item) => sum + item, 0);",
      },
    });
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ts" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Prompt template" }),
      { target: { value: "explain-step-by-step" } },
    );

    const question = composer().value;

    expect(question).toContain("Walk through this code step by step");
    expect(sendButton()).toBeEnabled();

    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const messages = sentMessages(fetchMock);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain(
      "Task: explain the supplied code.",
    );
    expect(messages[0]?.content).toContain("```ts");
    expect(messages[0]?.content).toContain(
      "const total = items.reduce",
    );
    expect(messages[1]).toEqual({
      role: "user",
      content: question,
    });
  });

  it("supports an error-only debug request", async () => {
    stubChrome();
    const fetchMock = vi.fn(async () =>
      staticResponse([
        chatLine({
          message: { role: "assistant", content: "Diagnosis" },
          done: false,
        }),
        chatLine({ done: true }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "Debug" }));
    expect(sendButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Error output"), {
      target: {
        value: "TypeError: Cannot read properties of undefined",
      },
    });
    expect(sendButton()).toBeEnabled();

    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const messages = sentMessages(fetchMock);

    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("No code was supplied.");
    expect(messages[0]?.content).toContain(
      "TypeError: Cannot read properties of undefined",
    );
  });

  it("clears transcript, mode, template, and context on New chat", async () => {
    stubChrome();
    const fetchMock = vi.fn(async () =>
      staticResponse([
        chatLine({
          message: { role: "assistant", content: "Diagnosis" },
          done: false,
        }),
        chatLine({ done: true }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "Debug" }));
    fireEvent.change(screen.getByLabelText("Code"), {
      target: { value: "const value = user.profile.name;" },
    });
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ts" },
    });
    fireEvent.change(screen.getByLabelText("Error output"), {
      target: {
        value: "TypeError: Cannot read properties of undefined",
      },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Prompt template" }),
      { target: { value: "debug-root-cause" } },
    );
    fireEvent.change(composer(), {
      target: { value: "Diagnose this failure" },
    });

    expect(
      screen.getByRole("button", { name: "Debug" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("combobox", { name: "Prompt template" }),
    ).toHaveValue("debug-root-cause");
    expect(screen.getByLabelText("Code")).toHaveValue(
      "const value = user.profile.name;",
    );
    expect(screen.getByLabelText("Language")).toHaveValue("ts");
    expect(screen.getByLabelText("Error output")).toHaveValue(
      "TypeError: Cannot read properties of undefined",
    );

    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Diagnosis")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "New chat" }),
      ).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));

    expect(
      screen.queryByText("Diagnose this failure"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnosis")).not.toBeInTheDocument();
    expect(
      screen.getByText("Start a local developer session"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chat" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("combobox", { name: "Prompt template" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Debug" }));

    expect(screen.getByLabelText("Code")).toHaveValue("");
    expect(screen.getByLabelText("Language")).toHaveValue("");
    expect(screen.getByLabelText("Error output")).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: "Prompt template" }),
    ).toHaveValue("debug-diagnose");
  });

  it("preserves a custom draft when switching task modes", () => {
    renderChat();

    fireEvent.change(composer(), {
      target: { value: "Compare these approaches" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Explain code" }),
    );
    expect(composer()).toHaveValue("Compare these approaches");

    fireEvent.click(
      screen.getByRole("button", { name: "Review code" }),
    );
    expect(composer()).toHaveValue("Compare these approaches");

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(composer()).toHaveValue("Compare these approaches");
  });

  it("sends on Enter but not Shift+Enter", async () => {
    stubChrome();
    const fetchMock = vi.fn(async () =>
      staticResponse([
        chatLine({
          message: { role: "assistant", content: "Answer" },
          done: false,
        }),
        chatLine({ done: true }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderChat();

    fireEvent.change(composer(), {
      target: { value: "Question" },
    });
    fireEvent.keyDown(composer(), {
      key: "Enter",
      shiftKey: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(composer(), { key: "Enter" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("stops generation and restores the composer", async () => {
    stubChrome();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { onBusyChange } = renderChat();

    fireEvent.change(composer(), {
      target: { value: "Keep going" },
    });
    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(
      await screen.findByText(
        "Stopped. Partial output is kept in this tab.",
      ),
    ).toBeInTheDocument();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(composer()).toBeEnabled();
    expect(sendButton()).toBeDisabled();
  });

  it("keeps partial output when the model reports an error", async () => {
    stubChrome();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        staticResponse([
          chatLine({
            message: { role: "assistant", content: "Partial answer" },
            done: false,
          }),
          chatLine({ error: "generation failed" }),
        ]),
      ),
    );
    renderChat();

    fireEvent.change(composer(), {
      target: { value: "Try this" },
    });
    fireEvent.click(sendButton());

    expect(
      await screen.findByText("Partial answer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ollama reported an error while generating a response.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a permission error without fetching", async () => {
    const chrome = stubChrome({ permitted: false, grant: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderChat();

    fireEvent.change(composer(), {
      target: { value: "Hello" },
    });
    fireEvent.click(sendButton());

    expect(
      await screen.findByText(
        "Chrome access to this local endpoint was not granted.",
      ),
    ).toBeInTheDocument();
    expect(chrome.request).toHaveBeenCalledWith({
      origins: ["http://127.0.0.1/*"],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(composer()).toBeEnabled();
    expect(sendButton()).toBeDisabled();
  });
});
