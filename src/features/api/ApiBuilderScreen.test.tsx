import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiBuilderScreen } from "./ApiBuilderScreen";
import {
  API_CANCEL_MESSAGE,
  API_EXECUTION_MESSAGE,
  type ApiResponseMetadata,
} from "./api-execution";

interface ChromeStubOptions {
  permitted?: boolean;
  grant?: boolean;
  sendMessage?: (message: unknown) => Promise<unknown>;
}

function responseData(
  overrides: Partial<ApiResponseMetadata> = {},
): ApiResponseMetadata {
  return {
    status: 200,
    statusText: "OK",
    durationMs: 42,
    contentType: "application/json",
    finalUrl: "https://api.example.com/items",
    headers: [{ name: "content-type", value: "application/json" }],
    body: '{"ok":true}',
    ...overrides,
  };
}

function successMessage(
  requestId: string,
  data: Partial<ApiResponseMetadata> = {},
) {
  return {
    type: API_EXECUTION_MESSAGE,
    requestId,
    ok: true as const,
    data: responseData(data),
  };
}

function stubChrome(options: ChromeStubOptions = {}) {
  const contains = vi.fn(async () => options.permitted ?? true);
  const request = vi.fn(async () => options.grant ?? true);
  const sendMessage = vi.fn(
    options.sendMessage ??
      (async (message: unknown) => {
        const execution = message as { requestId: string };
        return successMessage(execution.requestId);
      }),
  );

  vi.stubGlobal("chrome", {
    runtime: { id: "test-extension", sendMessage },
    permissions: { contains, request },
  });

  return { contains, request, sendMessage };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function urlInput(): HTMLInputElement {
  return screen.getByLabelText("Request URL") as HTMLInputElement;
}

function methodSelect(): HTMLSelectElement {
  return screen.getByLabelText("HTTP method") as HTMLSelectElement;
}

function sendButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: /^(Send|Sending…|Checking access…)$/,
  }) as HTMLButtonElement;
}

function typeUrl(value = "https://api.example.com/items") {
  fireEvent.change(urlInput(), { target: { value } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiBuilderScreen", () => {
  it("renders the editor and keeps Send disabled until the URL is valid", () => {
    render(<ApiBuilderScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: "API Builder" }),
    ).toBeInTheDocument();
    expect(methodSelect()).toHaveValue("GET");
    expect(urlInput()).toHaveValue("");
    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reset" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("tab", { name: "Params" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByLabelText("Parameter key 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use an absolute http:// or https:// URL. Send asks for access to that origin.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No response yet" }),
    ).toBeInTheDocument();
  });

  it("updates the method and URL with URL validation feedback", () => {
    render(<ApiBuilderScreen />);

    fireEvent.change(methodSelect(), { target: { value: "POST" } });
    expect(methodSelect()).toHaveValue("POST");

    typeUrl();
    expect(urlInput()).toHaveValue("https://api.example.com/items");
    expect(
      screen.getByText(
        "URL format valid. Send asks Chrome for access to this origin.",
      ),
    ).toBeInTheDocument();
    expect(sendButton()).not.toBeDisabled();

    fireEvent.change(urlInput(), { target: { value: "not a url" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid absolute URL",
    );
    expect(urlInput()).toHaveAttribute("aria-invalid", "true");
    expect(sendButton()).toBeDisabled();

    fireEvent.change(urlInput(), {
      target: { value: "ftp://example.com" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Only http:// and https:// URLs are supported.",
    );
    expect(sendButton()).toBeDisabled();
  });

  it("adds, edits, toggles, and removes query parameters", () => {
    render(<ApiBuilderScreen />);

    fireEvent.change(screen.getByLabelText("Parameter key 1"), {
      target: { value: "q" },
    });
    fireEvent.change(screen.getByLabelText("Parameter value 1"), {
      target: { value: "devlens" },
    });

    expect(screen.getByLabelText("Parameter key 1")).toHaveValue("q");
    expect(screen.getByLabelText("Parameter value 1")).toHaveValue(
      "devlens",
    );
    expect(
      screen.getByRole("tab", { name: "Params" }),
    ).toHaveTextContent("1");

    const enabled = screen.getByLabelText(
      "Enable parameter 1",
    ) as HTMLInputElement;
    fireEvent.click(enabled);
    expect(enabled).not.toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter" }),
    );
    expect(
      screen.getByLabelText("Parameter key 2"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove parameter 1" }),
    );
    expect(
      screen.queryByLabelText("Parameter key 2"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove parameter 1" }),
    );
    expect(screen.getByText("No query parameters")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter" }),
    );
    expect(
      screen.getByLabelText("Parameter key 1"),
    ).toBeInTheDocument();
  });

  it("edits request headers independently of parameters", () => {
    render(<ApiBuilderScreen />);

    fireEvent.click(screen.getByRole("tab", { name: "Headers" }));

    expect(screen.getByLabelText("Header key 1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Header key 1"), {
      target: { value: "Authorization" },
    });
    fireEvent.change(screen.getByLabelText("Header value 1"), {
      target: { value: "Bearer token" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add header" }));
    expect(screen.getByLabelText("Header key 2")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Headers" }),
    ).toHaveTextContent("1");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove header 1" }),
    );
    expect(
      screen.queryByLabelText("Header key 2"),
    ).not.toBeInTheDocument();
  });

  it("enables the body editor only after choosing a content type", () => {
    render(<ApiBuilderScreen />);

    fireEvent.click(screen.getByRole("tab", { name: "Body" }));

    const contentType = screen.getByLabelText(
      "Content type",
    ) as HTMLSelectElement;
    const body = screen.getByLabelText(
      "Request body",
    ) as HTMLTextAreaElement;

    expect(contentType).toHaveValue("none");
    expect(body).toBeDisabled();
    expect(
      screen.getByText(
        "Choose a content type to enable the body editor.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(contentType, {
      target: { value: "application/json" },
    });
    expect(body).not.toBeDisabled();

    fireEvent.change(body, {
      target: { value: '{"name":"Ada"}' },
    });
    expect(body).toHaveValue('{"name":"Ada"}');
    expect(
      screen.getByRole("tab", { name: "Body" }),
    ).toHaveTextContent("1");

    fireEvent.change(contentType, { target: { value: "none" } });
    expect(body).toBeDisabled();
  });

  it("resets every field and clears the response", () => {
    stubChrome();
    render(<ApiBuilderScreen />);

    fireEvent.change(methodSelect(), { target: { value: "PATCH" } });
    typeUrl("https://api.example.com");
    fireEvent.change(screen.getByLabelText("Parameter key 1"), {
      target: { value: "q" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Body" }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "text/plain" },
    });
    fireEvent.change(screen.getByLabelText("Request body"), {
      target: { value: "hello" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(methodSelect()).toHaveValue("GET");
    expect(urlInput()).toHaveValue("");
    expect(
      screen.getByRole("tab", { name: "Params" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Parameter key 1")).toHaveValue("");
    expect(
      screen.getByText(
        "Reset the request editor. The response was cleared.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Body" }));
    expect(screen.getByLabelText("Content type")).toHaveValue("none");
    expect(screen.getByLabelText("Request body")).toBeDisabled();
    expect(screen.getByLabelText("Request body")).toHaveValue("");
  });

  it("sends a normalized request when the origin is already granted", async () => {
    const { request, sendMessage } = stubChrome({ permitted: true });
    render(<ApiBuilderScreen />);

    fireEvent.change(methodSelect(), { target: { value: "POST" } });
    typeUrl();
    fireEvent.change(screen.getByLabelText("Parameter key 1"), {
      target: { value: "page" },
    });
    fireEvent.change(screen.getByLabelText("Parameter value 1"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Headers" }));
    fireEvent.change(screen.getByLabelText("Header key 1"), {
      target: { value: "Accept" },
    });
    fireEvent.change(screen.getByLabelText("Header value 1"), {
      target: { value: "application/json" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Body" }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "application/json" },
    });
    fireEvent.change(screen.getByLabelText("Request body"), {
      target: { value: '{"name":"Ada"}' },
    });

    fireEvent.click(sendButton());

    expect(await screen.findByText("200 OK")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const execution = sendMessage.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(execution).toMatchObject({
      type: API_EXECUTION_MESSAGE,
      method: "POST",
      url: "https://api.example.com/items",
      params: [{ key: "page", value: "2" }],
      headers: [{ key: "Accept", value: "application/json" }],
      body: {
        contentType: "application/json",
        content: '{"name":"Ada"}',
      },
    });
    expect(execution.timeoutMs).toBe(30_000);
    expect(execution.requestId).toEqual(expect.any(String));
  });

  it("prompts for origin access from Send and sends after it is granted", async () => {
    const { contains, request, sendMessage } = stubChrome({
      permitted: false,
      grant: true,
    });
    render(<ApiBuilderScreen />);

    typeUrl();
    fireEvent.click(sendButton());

    expect(await screen.findByText("200 OK")).toBeInTheDocument();
    expect(contains).toHaveBeenCalledWith({
      origins: ["https://api.example.com/*"],
    });
    expect(request).toHaveBeenCalledWith({
      origins: ["https://api.example.com/*"],
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not send when origin permission is denied", async () => {
    const { request, sendMessage } = stubChrome({
      permitted: false,
      grant: false,
    });
    render(<ApiBuilderScreen />);

    typeUrl();
    fireEvent.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permission to access this origin was not granted.",
    );
    expect(screen.getByText("Code: permission-denied")).toBeInTheDocument();
    expect(request).toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("shows a loading state and ignores duplicate Send clicks", async () => {
    const pending = deferred<unknown>();
    const { sendMessage } = stubChrome({
      permitted: true,
      sendMessage: () => pending.promise,
    });
    render(<ApiBuilderScreen />);

    typeUrl();
    const send = sendButton();
    fireEvent.click(send);
    fireEvent.click(send);

    expect(
      await screen.findByText("Sending request…"),
    ).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveTextContent("Sending…");
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    const execution = sendMessage.mock.calls[0]?.[0] as {
      requestId: string;
    };
    pending.resolve(successMessage(execution.requestId));

    expect(await screen.findByText("200 OK")).toBeInTheDocument();
  });

  it("cancels an in-flight request and reports the cancelled result", async () => {
    const pending = deferred<unknown>();
    const sendMessage = vi.fn((message: unknown) => {
      const execution = message as {
        type: string;
        requestId: string;
      };

      if (execution.type === API_CANCEL_MESSAGE) {
        return Promise.resolve({
          type: API_CANCEL_MESSAGE,
          requestId: execution.requestId,
          ok: true,
          data: { cancelled: true },
        });
      }

      return pending.promise;
    });
    stubChrome({ permitted: true, sendMessage });
    render(<ApiBuilderScreen />);

    typeUrl();
    fireEvent.click(sendButton());
    expect(
      await screen.findByText("Sending request…"),
    ).toBeInTheDocument();

    const execution = sendMessage.mock.calls[0]?.[0] as {
      requestId: string;
    };
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Cancelling")).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith({
      type: API_CANCEL_MESSAGE,
      requestId: execution.requestId,
    });

    pending.resolve({
      type: API_EXECUTION_MESSAGE,
      requestId: execution.requestId,
      ok: false,
      error: {
        code: "aborted",
        message: "The request was cancelled.",
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The request was cancelled.",
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Code: aborted")).toBeInTheDocument();
  });

  it("keeps the request in flight when cancellation cannot be delivered", async () => {
    const pending = deferred<unknown>();
    const sendMessage = vi.fn((message: unknown) => {
      const execution = message as {
        type: string;
        requestId: string;
      };

      if (execution.type === API_CANCEL_MESSAGE) {
        return Promise.resolve({
          type: API_CANCEL_MESSAGE,
          requestId: execution.requestId,
          ok: false,
          error: {
            code: "runtime-error",
            message: "The background worker did not respond.",
          },
        });
      }

      return pending.promise;
    });
    stubChrome({ permitted: true, sendMessage });
    render(<ApiBuilderScreen />);

    typeUrl();
    fireEvent.click(sendButton());
    expect(
      await screen.findByText("Sending request…"),
    ).toBeInTheDocument();

    const execution = sendMessage.mock.calls[0]?.[0] as {
      requestId: string;
    };
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByText(
        "The request could not be cancelled. It may still complete.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Sending request…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();

    pending.resolve(successMessage(execution.requestId));

    expect(await screen.findByText("200 OK")).toBeInTheDocument();
  });

  it("renders HTTP error statuses, JSON bodies, and response headers", async () => {
    const sendMessage = vi.fn(async (message: unknown) => {
      const execution = message as { requestId: string };
      return successMessage(execution.requestId, {
        status: 404,
        statusText: "Not Found",
        durationMs: 17,
        contentType: "application/json; charset=utf-8",
        finalUrl: "https://api.example.com/missing",
        headers: [
          { name: "content-type", value: "application/json" },
          { name: "x-request-id", value: "abc123" },
        ],
        body: '{"error":"missing"}',
      });
    });
    const { sendMessage: send } = stubChrome({ sendMessage });
    render(<ApiBuilderScreen />);

    typeUrl();
    fireEvent.click(sendButton());

    expect(await screen.findByText("404 Not Found")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("17 ms")).toBeInTheDocument();
    expect(
      screen.getByText("application/json; charset=utf-8"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://api.example.com/missing"),
    ).toBeInTheDocument();

    const body = screen.getByLabelText("Response body");
    expect(body).toHaveTextContent(/"error": "missing"/);
    expect(screen.getByText("JSON")).toBeInTheDocument();

    const responseSections = screen.getByRole("tablist", {
      name: "Response sections",
    });
    fireEvent.click(
      within(responseSections).getByRole("tab", {
        name: /Headers/,
      }),
    );
    expect(screen.getByText("x-request-id")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("falls back to raw text for malformed JSON", async () => {
    const sendMessage = vi.fn(async (message: unknown) => {
      const execution = message as { requestId: string };
      return successMessage(execution.requestId, {
        contentType: "application/json",
        body: "{oops",
      });
    });
    stubChrome({ sendMessage });
    render(<ApiBuilderScreen />);

    typeUrl();
    fireEvent.click(sendButton());

    expect(await screen.findByText("200 OK")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Showing raw text because the body is not valid JSON.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Response body")).toHaveTextContent(
      "{oops",
    );
  });

  it("renders plain text and empty response bodies safely", async () => {
    const sendMessage = vi.fn(async (message: unknown) => {
      const execution = message as { requestId: string };
      return successMessage(execution.requestId, {
        contentType: "text/html",
        body: "<script>alert(1)</script>",
        headers: [{ name: "content-type", value: "text/html" }],
      });
    });
    stubChrome({ sendMessage });
    render(<ApiBuilderScreen />);

    typeUrl();
    fireEvent.click(sendButton());

    expect(await screen.findByText("200 OK")).toBeInTheDocument();
    expect(screen.getByLabelText("Response body")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(
      screen.queryByText(
        "Showing raw text because the body is not valid JSON.",
      ),
    ).not.toBeInTheDocument();
  });

  it("reports timeout, transport, and oversized responses distinctly", async () => {
    const cases = [
      {
        error: {
          code: "timeout",
          message: "The request timed out.",
        },
        badge: "Timed out",
      },
      {
        error: {
          code: "network-error",
          message: "The request failed due to a network error.",
        },
        badge: "Failed",
      },
      {
        error: {
          code: "response-too-large",
          message:
            "The response exceeded the 2 MB inspection limit.",
        },
        badge: "Too large",
      },
    ] as const;

    for (const testCase of cases) {
      const sendMessage = vi.fn(async (message: unknown) => {
        const execution = message as { requestId: string };
        return {
          type: API_EXECUTION_MESSAGE,
          requestId: execution.requestId,
          ok: false as const,
          error: testCase.error,
        };
      });
      stubChrome({ sendMessage });
      const { unmount } = render(<ApiBuilderScreen />);

      typeUrl();
      fireEvent.click(sendButton());

      expect(
        await screen.findByText(testCase.error.message),
      ).toBeInTheDocument();
      expect(screen.getByText(testCase.badge)).toBeInTheDocument();
      expect(
        screen.getByText(`Code: ${testCase.error.code}`),
      ).toBeInTheDocument();

      unmount();
      vi.unstubAllGlobals();
    }
  });

  it("never fetches directly or persists drafts and responses", async () => {
    const fetchMock = vi.fn();
    const setItem = vi.fn();
    const sendMessage = vi.fn(async (message: unknown) => {
      const execution = message as { requestId: string };
      return successMessage(execution.requestId);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    stubChrome({ sendMessage });
    render(<ApiBuilderScreen />);

    fireEvent.change(methodSelect(), { target: { value: "POST" } });
    typeUrl();
    fireEvent.change(screen.getByLabelText("Parameter key 1"), {
      target: { value: "q" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.click(screen.getByRole("tab", { name: "Headers" }));
    fireEvent.change(screen.getByLabelText("Header key 1"), {
      target: { value: "Authorization" },
    });
    fireEvent.change(screen.getByLabelText("Header value 1"), {
      target: { value: "Bearer secret" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Body" }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "application/json" },
    });
    fireEvent.change(screen.getByLabelText("Request body"), {
      target: { value: '{"secret":true}' },
    });

    fireEvent.click(sendButton());
    expect(await screen.findByText("200 OK")).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
