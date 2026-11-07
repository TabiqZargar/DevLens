import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type NetworkCapture,
  type NetworkCaptureState,
  type NetworkRequestListener,
} from "../../features/network/network-capture";
import { PanelApp } from "./PanelApp";

type PanelGetContent = (
  callback?: (content: string, encoding: string) => void,
) => void | Promise<{ content: string; encoding: string }>;

interface HarEntryOptions {
  method?: string;
  url?: string;
  status?: number | null;
  statusText?: string;
  resourceType?: string;
  durationMs?: number | null;
  requestSizeBytes?: number | null;
  responseSizeBytes?: number | null;
  startedAt?: string | null;
  requestHeaders?: { name: string; value: string }[];
  responseHeaders?: { name: string; value: string }[];
  queryString?: { name: string; value: string }[];
  postData?: {
    mimeType?: string;
    text?: string | null;
    params?: {
      name: string;
      value: string;
      fileName?: string;
      contentType?: string;
    }[];
  } | null;
  initiator?: unknown;
  getContent?: PanelGetContent;
}

function makePanelHarEntry(
  options: HarEntryOptions = {},
): HARFormatEntry {
  const {
    method = "GET",
    url = "https://api.example.com/default",
    status = 200,
    statusText = "OK",
    resourceType = "fetch",
    durationMs = 125,
    requestSizeBytes = 0,
    responseSizeBytes = 42,
    startedAt = "2026-01-01T00:00:00.000Z",
    requestHeaders = [
      { name: "Accept", value: "application/json" },
    ],
    responseHeaders = [
      { name: "Content-Type", value: "application/json" },
    ],
    queryString = [],
    postData = null,
    initiator,
    getContent,
  } = options;

  return {
    startedDateTime: startedAt ?? undefined,
    time: durationMs ?? undefined,
    _resourceType: resourceType,
    request: {
      method,
      url,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: requestHeaders,
      queryString,
      headersSize: 0,
      bodySize: requestSizeBytes ?? undefined,
      ...(postData === null
        ? {}
        : {
            postData: {
              mimeType: postData.mimeType ?? "",
              text: postData.text ?? undefined,
              params: postData.params ?? [],
            },
          }),
    },
    response: {
      status: status ?? undefined,
      statusText,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: responseHeaders,
      content: { size: responseSizeBytes ?? 0, mimeType: "application/json" },
      redirectURL: "",
      headersSize: 0,
      bodySize: responseSizeBytes ?? undefined,
    },
    cache: {},
    timings: { send: 0, wait: 0, receive: 0 },
    ...(initiator === undefined ? {} : { _initiator: initiator }),
    ...(getContent === undefined ? {} : { getContent }),
  } as unknown as HARFormatEntry;
}

function makePanelHarLog(entries: HARFormatEntry[]): HARFormatLog {
  return {
    version: "1.2",
    creator: { name: "test", version: "1.0" },
    entries,
  };
}

interface DevToolsStubOptions {
  entries?: HARFormatEntry[];
  unavailable?: boolean;
  getHAR?: (callback?: (harLog: HARFormatLog) => void) => void;
}

function stubDevToolsNetwork(options: DevToolsStubOptions = {}) {
  let listener: NetworkRequestListener | null = null;

  const addListener = vi.fn((next: NetworkRequestListener): void => {
    listener = next;
  });
  const removeListener = vi.fn((next: NetworkRequestListener): void => {
    if (listener === next) listener = null;
  });
  const getHAR = vi.fn(
    (callback?: (harLog: HARFormatLog) => void): void => {
      if (options.getHAR) {
        options.getHAR(callback);
        return;
      }

      callback?.(makePanelHarLog(options.entries ?? []));
    },
  );

  const network = options.unavailable
    ? undefined
    : {
        onRequestFinished: { addListener, removeListener },
        getHAR,
      };

  vi.stubGlobal("chrome", {
    devtools: {
      inspectedWindow: { tabId: 7 },
      network,
    },
  });

  return {
    addListener,
    removeListener,
    getHAR,
    emit(entry: HARFormatEntry): void {
      listener?.(entry);
    },
    getListener(): NetworkRequestListener | null {
      return listener;
    },
  };
}

function createFakeCapture(): {
  capture: NetworkCapture;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  let state: NetworkCaptureState = {
    status: "idle",
    snapshotStatus: "idle",
    entries: [],
  };
  const listeners = new Set<(next: NetworkCaptureState) => void>();
  const unsubscribe = vi.fn(
    (listener: (next: NetworkCaptureState) => void): void => {
      listeners.delete(listener);
    },
  );
  const subscribe = vi.fn(
    (listener: (next: NetworkCaptureState) => void) => {
      listeners.add(listener);
      return () => unsubscribe(listener);
    },
  );
  const start = vi.fn(() => {
    state = { ...state, status: "running", snapshotStatus: "loaded" };
    for (const listener of listeners) listener(state);
  });
  const stop = vi.fn(() => {
    state = { ...state, status: "idle", snapshotStatus: "idle" };
    for (const listener of listeners) listener(state);
  });

  const capture: NetworkCapture = {
    start,
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),
    stop,
    loadResponseContent: vi.fn(async () => ({
      status: "unavailable" as const,
    })),
    subscribe,
    getSnapshot: () => state,
  };

  return { capture, start, stop, subscribe, unsubscribe };
}

function requestRow(urlPart: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(urlPart) });
}

function queryRequestRow(urlPart: string): HTMLElement | null {
  return screen.queryByRole("row", { name: new RegExp(urlPart) });
}

function detailsRegion(): HTMLElement {
  return screen.getByRole("region", { name: "Request details" });
}

function stubClipboard() {
  const writeText = vi.fn(async (_text: string) => {});

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  return writeText;
}

function stubObjectUrls() {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:devlens-test");
  const revokeObjectURL = vi.fn((_url: string) => {});

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });

  return { createObjectURL, revokeObjectURL };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("PanelApp", () => {
  it("starts capture, renders live requests, and shows the request count", () => {
    const network = stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/snapshot",
          status: 200,
        }),
      ],
    });

    render(<PanelApp />);

    expect(network.addListener).toHaveBeenCalledTimes(1);
    expect(network.getHAR).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Capturing");
    expect(requestRow("/snapshot")).toBeInTheDocument();
    expect(screen.getByText("1 request")).toBeInTheDocument();

    act(() => {
      network.emit(
        makePanelHarEntry({
          method: "POST",
          url: "https://api.example.com/live?tag=a",
          status: 201,
          statusText: "Created",
          resourceType: "xhr",
        }),
      );
    });

    const liveRow = requestRow("/live");
    expect(within(liveRow).getByText("POST")).toBeInTheDocument();
    expect(within(liveRow).getByText("XHR")).toBeInTheDocument();
    expect(within(liveRow).getByText("201")).toBeInTheDocument();
    expect(screen.getByText("2 requests")).toBeInTheDocument();
  });

  it("selects a row and renders overview, request, response, and timing details", () => {
    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          method: "POST",
          url: "https://api.example.com/items?page=2",
          status: 201,
          statusText: "Created",
          durationMs: 125,
          requestSizeBytes: 12,
          responseSizeBytes: 42,
          requestHeaders: [
            { name: "Accept", value: "application/json" },
          ],
          responseHeaders: [
            { name: "X-Request-Id", value: "abc-123" },
          ],
          queryString: [{ name: "page", value: "2" }],
          postData: {
            mimeType: "application/json",
            text: '{"name":"Ada"}',
            params: [],
          },
        }),
      ],
    });

    render(<PanelApp />);

    const row = requestRow("/items");
    fireEvent.click(row);

    expect(row).toHaveAttribute("aria-selected", "true");
    const details = detailsRegion();
    expect(
      within(details).getByRole("tab", { name: "Overview" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(details).getAllByText(
        "https://api.example.com/items?page=2",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(details).getAllByText("201 Created").length,
    ).toBeGreaterThan(0);
    expect(within(details).getAllByText("Fetch").length).toBeGreaterThan(0);

    fireEvent.click(
      within(details).getByRole("tab", { name: "Request" }),
    );
    const requestPanel = within(details).getByRole("tabpanel");
    expect(within(requestPanel).getByText("Accept")).toBeInTheDocument();
    expect(
      within(requestPanel).getAllByText("application/json").length,
    ).toBeGreaterThan(0);
    expect(within(requestPanel).getByText("page")).toBeInTheDocument();
    expect(within(requestPanel).getByText("JSON payload")).toBeInTheDocument();
    expect(
      within(requestPanel).getByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          element.textContent?.includes('"name": "Ada"') === true,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    const responsePanel = within(details).getByRole("tabpanel");
    expect(
      within(responsePanel).getByText("X-Request-Id"),
    ).toBeInTheDocument();
    expect(within(responsePanel).getByText("abc-123")).toBeInTheDocument();

    fireEvent.click(
      within(details).getByRole("tab", { name: "Timing" }),
    );
    const timingPanel = within(details).getByRole("tabpanel");
    expect(within(timingPanel).getByText("125 ms")).toBeInTheDocument();
    expect(
      within(timingPanel).getByText(/DNS, connect, TLS/),
    ).toBeInTheDocument();
  });

  it("combines search, resource type, and status filters", () => {
    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/users",
          resourceType: "fetch",
          status: 200,
        }),
        makePanelHarEntry({
          method: "POST",
          url: "https://api.example.com/missing",
          resourceType: "xhr",
          status: 404,
        }),
        makePanelHarEntry({
          url: "https://www.example.org/page",
          resourceType: "document",
          status: 500,
        }),
      ],
    });

    render(<PanelApp />);

    const search = screen.getByLabelText(
      "Search requests",
    ) as HTMLInputElement;
    const resourceType = screen.getByLabelText(
      "Resource type",
    ) as HTMLSelectElement;
    const statusClass = screen.getByLabelText(
      "Status class",
    ) as HTMLSelectElement;

    expect(screen.getByText("3 requests")).toBeInTheDocument();

    fireEvent.change(search, {
      target: { value: "api.example.com" },
    });
    expect(screen.getByText("2 of 3 requests")).toBeInTheDocument();
    expect(requestRow("/users")).toBeInTheDocument();
    expect(requestRow("/missing")).toBeInTheDocument();
    expect(queryRequestRow("/page")).not.toBeInTheDocument();

    fireEvent.change(resourceType, { target: { value: "xhr" } });
    expect(screen.getByText("1 of 3 requests")).toBeInTheDocument();
    expect(queryRequestRow("/users")).not.toBeInTheDocument();
    expect(requestRow("/missing")).toBeInTheDocument();

    fireEvent.change(statusClass, {
      target: { value: "client-error" },
    });
    expect(requestRow("/missing")).toBeInTheDocument();

    fireEvent.change(statusClass, { target: { value: "success" } });
    expect(screen.getByText("0 of 3 requests")).toBeInTheDocument();
    expect(screen.getByText("No requests match")).toBeInTheDocument();
    expect(
      screen.queryByText("No requests captured yet"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );

    expect(search).toHaveValue("");
    expect(resourceType).toHaveValue("all");
    expect(statusClass).toHaveValue("all");
    expect(requestRow("/page")).toBeInTheDocument();
    expect(screen.getByText("3 requests")).toBeInTheDocument();
  });

  it("pauses, resumes, and clears capture without losing selection state", () => {
    const network = stubDevToolsNetwork();

    render(<PanelApp />);

    act(() => {
      network.emit(
        makePanelHarEntry({
          url: "https://api.example.com/first",
        }),
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Pause" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Paused");

    act(() => {
      network.emit(
        makePanelHarEntry({
          url: "https://api.example.com/paused",
        }),
      );
    });

    expect(queryRequestRow("/paused")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Resume" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Capturing");

    act(() => {
      network.emit(
        makePanelHarEntry({
          url: "https://api.example.com/resumed",
        }),
      );
    });

    const resumedRow = requestRow("/resumed");
    fireEvent.click(resumedRow);
    expect(resumedRow).toHaveAttribute("aria-selected", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Clear" }),
    );

    expect(screen.getByText("0 requests")).toBeInTheDocument();
    expect(screen.getByText("No requests captured yet")).toBeInTheDocument();
    expect(queryRequestRow("/resumed")).not.toBeInTheDocument();
    expect(
      within(detailsRegion()).getByText("Select a request to inspect"),
    ).toBeInTheDocument();
  });

  it("shows an unavailable state when the DevTools network API is missing", () => {
    const network = stubDevToolsNetwork({ unavailable: true });

    render(<PanelApp />);

    expect(network.addListener).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Unavailable");
    expect(
      screen.getByRole("heading", {
        name: "Network capture unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pause" }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Search requests"),
    ).toBeDisabled();
  });

  it("renders missing request fields gracefully", () => {
    const network = stubDevToolsNetwork();

    render(<PanelApp />);

    act(() => {
      network.emit(
        makePanelHarEntry({
          url: "https://api.example.com/no-response",
          status: null,
          durationMs: null,
          requestSizeBytes: null,
          responseSizeBytes: null,
          startedAt: null,
          requestHeaders: [],
          responseHeaders: [],
          queryString: [],
          postData: null,
        }),
      );
    });

    const row = requestRow("/no-response");
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);

    fireEvent.click(row);
    const details = detailsRegion();
    expect(
      within(details).getAllByText("Not available").length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      within(details).getByRole("tab", { name: "Request" }),
    );
    const requestPanel = within(details).getByRole("tabpanel");
    expect(
      within(requestPanel).getByText("No request headers captured."),
    ).toBeInTheDocument();
    expect(
      within(requestPanel).getByText("No query parameters."),
    ).toBeInTheDocument();
    expect(
      within(requestPanel).getByText("No request payload captured."),
    ).toBeInTheDocument();

    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    expect(
      within(details).getByText("No response headers captured."),
    ).toBeInTheDocument();
  });

  it("loads response content lazily and prevents duplicate loads", async () => {
    let resolveContent:
      | ((content: string, encoding: string) => void)
      | null = null;
    const getContent = vi.fn<PanelGetContent>((callback) => {
      resolveContent = callback ?? null;
    });

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/lazy",
          getContent,
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/lazy"));
    const details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    const panel = within(details).getByRole("tabpanel");

    expect(getContent).not.toHaveBeenCalled();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Load response" }),
    );

    expect(getContent).toHaveBeenCalledTimes(1);
    expect(
      within(panel).getByRole("button", {
        name: "Loading response…",
      }),
    ).toBeDisabled();

    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Loading response…",
      }),
    );
    expect(getContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveContent?.("lazy body", "");
    });

    expect(await screen.findByText("lazy body")).toBeInTheDocument();
  });

  it("formats JSON response bodies", async () => {
    const getContent = vi.fn<PanelGetContent>((callback) => {
      callback?.('{"ok":true}', "");
    });

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/json",
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
          ],
          getContent,
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/json"));
    const details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    fireEvent.click(
      within(details).getByRole("button", { name: "Load response" }),
    );

    const formatted = await screen.findByText(
      (_, element) =>
        element?.tagName === "PRE" &&
        element.textContent?.includes('"ok": true') === true,
    );

    expect(formatted.textContent).toContain("\n");
  });

  it("decodes base64 textual response bodies", async () => {
    const getContent = vi.fn<PanelGetContent>((callback) => {
      callback?.(btoa("base64 body"), "base64");
    });

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/base64",
          responseHeaders: [
            { name: "Content-Type", value: "text/plain; charset=utf-8" },
          ],
          getContent,
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/base64"));
    const details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    fireEvent.click(
      within(details).getByRole("button", { name: "Load response" }),
    );

    expect(await screen.findByText("base64 body")).toBeInTheDocument();
  });

  it("shows empty, unavailable, and binary response states", async () => {
    const emptyContent = vi.fn<PanelGetContent>((callback) => {
      callback?.("", "");
    });
    const binaryContent = vi.fn<PanelGetContent>((callback) => {
      callback?.(btoa("\u0000\u0001PNG"), "base64");
    });

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/empty",
          getContent: emptyContent,
        }),
        makePanelHarEntry({
          url: "https://api.example.com/unavailable",
        }),
        makePanelHarEntry({
          url: "https://api.example.com/binary",
          responseHeaders: [
            { name: "Content-Type", value: "image/png" },
          ],
          getContent: binaryContent,
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/empty"));
    let details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    fireEvent.click(
      within(details).getByRole("button", { name: "Load response" }),
    );
    expect(
      await screen.findByText("Response body is empty."),
    ).toBeInTheDocument();

    fireEvent.click(requestRow("/unavailable"));
    details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    expect(
      within(details).getByText(
        "Response body is not available for this request.",
      ),
    ).toBeInTheDocument();
    expect(
      within(details).queryByRole("button", {
        name: "Load response",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(requestRow("/binary"));
    details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    fireEvent.click(
      within(details).getByRole("button", { name: "Load response" }),
    );
    expect(
      await screen.findByText(
        "Binary response (image/png) cannot be displayed as text.",
      ),
    ).toBeInTheDocument();
  });

  it("reports response content retrieval failures", async () => {
    const getContent = vi.fn<PanelGetContent>(() => {
      throw new Error("content unavailable");
    });

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/failure",
          getContent,
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/failure"));
    const details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    fireEvent.click(
      within(details).getByRole("button", { name: "Load response" }),
    );

    expect(
      await screen.findByText("Could not load the response body."),
    ).toBeInTheDocument();
    expect(
      within(details).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("ignores a stale response after the selection changes", async () => {
    let resolveFirst:
      | ((content: string, encoding: string) => void)
      | null = null;
    const firstContent = vi.fn<PanelGetContent>((callback) => {
      resolveFirst = callback ?? null;
    });
    const secondContent = vi.fn<PanelGetContent>((callback) => {
      callback?.("second body", "");
    });

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/first-body",
          getContent: firstContent,
        }),
        makePanelHarEntry({
          url: "https://api.example.com/second-body",
          getContent: secondContent,
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/first-body"));
    let details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    fireEvent.click(
      within(details).getByRole("button", { name: "Load response" }),
    );

    expect(firstContent).toHaveBeenCalledTimes(1);

    fireEvent.click(requestRow("/second-body"));

    await act(async () => {
      resolveFirst?.("stale body", "");
    });

    expect(screen.queryByText("stale body")).not.toBeInTheDocument();
  });

  it("copies a selected request as cURL with a sensitive-data warning", async () => {
    const writeText = stubClipboard();

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          method: "POST",
          url: "https://api.example.com/copy",
          requestHeaders: [
            { name: "Authorization", value: "Bearer secret" },
          ],
          postData: {
            mimeType: "application/json",
            text: '{"name":"Ada"}',
            params: [],
          },
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/copy"));
    const details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("button", {
        name: "Copy as cURL",
      }),
    );

    expect(
      await within(details).findByText(
        "Copied cURL. It may contain credentials or sensitive headers.",
      ),
    ).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);

    const command = writeText.mock.calls[0]?.[0];

    expect(command).toContain("curl --request 'POST'");
    expect(command).toContain(
      "--header 'Authorization: Bearer secret'",
    );
    expect(command).toContain("--data-raw '{\"name\":\"Ada\"}'");
  });

  it("exports loaded response bodies in a HAR file", async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const getContent = vi.fn<PanelGetContent>((callback) => {
      callback?.('{"ok":true}', "");
    });

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/export",
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
          ],
          getContent,
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/export"));
    const details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Response" }),
    );
    fireEvent.click(
      within(details).getByRole("button", { name: "Load response" }),
    );
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          element.textContent?.includes('"ok": true') === true,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Export HAR" }),
    );

    expect(
      await screen.findByText("Exported 1 request."),
    ).toBeInTheDocument();
    expect(click).toHaveBeenCalledTimes(1);

    const blob = createObjectURL.mock.calls[0]?.[0];

    if (!blob) throw new Error("Expected an exported HAR blob.");

    expect(blob.type).toBe("application/json");

    const har = JSON.parse(await blob.text()) as {
      log: {
        entries: {
          response: { content: { text?: string } };
        }[];
      };
    };

    expect(har.log.entries[0]?.response.content.text).toBe(
      '{"ok":true}',
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:devlens-test");
  });

  it("reports HAR export failures", async () => {
    const { createObjectURL } = stubObjectUrls();

    createObjectURL.mockImplementation(() => {
      throw new Error("download blocked");
    });

    stubDevToolsNetwork({
      entries: [makePanelHarEntry()],
    });

    render(<PanelApp />);

    fireEvent.click(
      screen.getByRole("button", { name: "Export HAR" }),
    );

    expect(
      await screen.findByText("Could not export the HAR file."),
    ).toBeInTheDocument();
  });

  it("disables HAR export when no requests are captured", () => {
    stubDevToolsNetwork();

    render(<PanelApp />);

    expect(
      screen.getByRole("button", { name: "Export HAR" }),
    ).toBeDisabled();
  });

  it("renders initiator details and handles missing initiators", () => {
    const initiator = {
      type: "script",
      url: "https://api.example.com/app.js",
      lineNumber: 10,
      columnNumber: 4,
      stack: {
        callFrames: [
          {
            functionName: "load",
            url: "https://api.example.com/app.js",
            lineNumber: 10,
            columnNumber: 4,
          },
          {
            functionName: "start",
            url: "https://api.example.com/main.js",
            lineNumber: 3,
            columnNumber: 1,
          },
        ],
      },
    };

    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/with-initiator",
          initiator,
        }),
        makePanelHarEntry({
          url: "https://api.example.com/without-initiator",
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/with-initiator"));
    let details = detailsRegion();
    expect(within(details).getByText("Script")).toBeInTheDocument();
    expect(
      within(details).getByText("https://api.example.com/app.js"),
    ).toBeInTheDocument();
    expect(within(details).getAllByText("10:4").length).toBeGreaterThan(0);
    expect(within(details).getByText("load")).toBeInTheDocument();
    expect(within(details).getByText("/main.js")).toBeInTheDocument();

    fireEvent.click(requestRow("/without-initiator"));
    details = detailsRegion();
    expect(
      within(details).getByText(
        "No initiator information captured.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps non-JSON request payloads as readable raw text", () => {
    stubDevToolsNetwork({
      entries: [
        makePanelHarEntry({
          url: "https://api.example.com/form",
          method: "POST",
          postData: {
            mimeType: "text/plain",
            text: "name=Ada",
          },
        }),
      ],
    });

    render(<PanelApp />);

    fireEvent.click(requestRow("/form"));
    const details = detailsRegion();
    fireEvent.click(
      within(details).getByRole("tab", { name: "Request" }),
    );

    expect(within(details).getByText("Raw payload")).toBeInTheDocument();
    expect(
      within(details).getByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          element.textContent === "name=Ada",
      ),
    ).toBeInTheDocument();
  });

  it("subscribes, starts on mount, and stops and unsubscribes on unmount", () => {
    const fake = createFakeCapture();
    const { unmount } = render(<PanelApp capture={fake.capture} />);

    expect(fake.subscribe).toHaveBeenCalledTimes(1);
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Capturing");

    unmount();

    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it("does not leave duplicate listeners after StrictMode effect replay", () => {
    const network = stubDevToolsNetwork();

    render(
      <StrictMode>
        <PanelApp />
      </StrictMode>,
    );

    expect(network.addListener).toHaveBeenCalledTimes(2);
    expect(network.removeListener).toHaveBeenCalledTimes(1);
    expect(network.getHAR).toHaveBeenCalledTimes(2);
    expect(network.getListener()).not.toBeNull();
  });
});
