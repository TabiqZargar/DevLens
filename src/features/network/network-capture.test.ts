import { describe, expect, it, vi } from "vitest";
import {
  createNetworkCapture,
  type NetworkCaptureApi,
  type NetworkCaptureState,
  type NetworkRequestListener,
} from "./network-capture";
import { NETWORK_ENTRY_LIMIT } from "./network-model";

interface HarEntryOverrides {
  startedDateTime?: string;
  time?: number;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  [key: string]: unknown;
}

function makeHarEntry(
  overrides: HarEntryOverrides = {},
): HARFormatEntry {
  const {
    startedDateTime = "2026-01-01T00:00:00.000Z",
    time = 125,
    request,
    response,
    ...rest
  } = overrides;

  return {
    startedDateTime,
    time,
    request: {
      method: "GET",
      url: "https://api.example.com/users?page=2",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [{ name: "Accept", value: "application/json" }],
      queryString: [{ name: "page", value: "2" }],
      headersSize: 120,
      bodySize: 0,
      ...request,
    },
    response: {
      status: 200,
      statusText: "OK",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [{ name: "Content-Type", value: "application/json" }],
      content: { size: 42, mimeType: "application/json" },
      redirectURL: "",
      headersSize: 80,
      bodySize: 42,
      ...response,
    },
    cache: {},
    timings: { send: 0, wait: 50, receive: 50 },
    ...rest,
  } as unknown as HARFormatEntry;
}

function makeHarLog(entries: HARFormatEntry[]): HARFormatLog {
  return {
    version: "1.2",
    creator: { name: "test", version: "1.0" },
    entries,
  };
}

function createMockApi() {
  let listener: NetworkRequestListener | null = null;

  const addListener = vi.fn(
    (next: NetworkRequestListener): void => {
      listener = next;
    },
  );
  const removeListener = vi.fn(
    (next: NetworkRequestListener): void => {
      if (listener === next) listener = null;
    },
  );
  const getHAR = vi.fn<
    (
      callback?: (harLog: HARFormatLog) => void,
    ) => void | Promise<HARFormatLog>
  >();

  const api: NetworkCaptureApi = {
    onRequestFinished: { addListener, removeListener },
    getHAR,
  };

  return {
    api,
    addListener,
    removeListener,
    getHAR,
    emit(request: HARFormatEntry): void {
      listener?.(request);
    },
    getListener(): NetworkRequestListener | null {
      return listener;
    },
  };
}

function createDeferredHar() {
  let callback: ((harLog: HARFormatLog) => void) | null = null;

  return {
    implementation(
      next?: (harLog: HARFormatLog) => void,
    ): void {
      callback = next ?? null;
    },
    resolve(harLog: HARFormatLog): void {
      if (!callback) {
        throw new Error("HAR callback was not requested.");
      }

      callback(harLog);
    },
  };
}

describe("network capture", () => {
  it("subscribes before requesting the HAR snapshot and captures live requests", () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });

    capture.start();

    const addOrder =
      mock.addListener.mock.invocationCallOrder[0];
    const harOrder = mock.getHAR.mock.invocationCallOrder[0];

    if (addOrder === undefined || harOrder === undefined) {
      throw new Error("Expected capture setup calls.");
    }

    expect(addOrder).toBeLessThan(harOrder);
    expect(mock.addListener).toHaveBeenCalledTimes(1);
    expect(mock.getHAR).toHaveBeenCalledTimes(1);

    mock.emit(
      makeHarEntry({
        _resourceType: "fetch",
        request: {
          method: "POST",
          url: "https://api.example.com/items?tag=a",
        },
        response: { status: 201, statusText: "Created" },
      }),
    );

    const snapshot = capture.getSnapshot();

    expect(snapshot.status).toBe("running");
    expect(snapshot.snapshotStatus).toBe("loading");
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      method: "POST",
      url: "https://api.example.com/items?tag=a",
      host: "api.example.com",
      status: 201,
      statusText: "Created",
      statusClass: "success",
      resourceType: "fetch",
    });
  });

  it("seeds entries from the initial HAR snapshot", () => {
    const mock = createMockApi();
    const first = makeHarEntry({
      request: { url: "https://api.example.com/first" },
      response: { status: 200 },
    });
    const second = makeHarEntry({
      request: { url: "https://api.example.com/second" },
      response: { status: 404 },
    });

    mock.getHAR.mockImplementation((callback) => {
      callback?.(makeHarLog([first, second]));
    });

    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    const snapshot = capture.getSnapshot();

    expect(snapshot.snapshotStatus).toBe("loaded");
    expect(snapshot.entries.map((entry) => entry.url)).toEqual([
      "https://api.example.com/first",
      "https://api.example.com/second",
    ]);
    expect(
      snapshot.entries.map((entry) => entry.statusClass),
    ).toEqual(["success", "client-error"]);
  });

  it("accepts a promise-based HAR snapshot", async () => {
    const mock = createMockApi();

    mock.getHAR.mockImplementation(() =>
      Promise.resolve(
        makeHarLog([
          makeHarEntry({
            request: { url: "https://api.example.com/promised" },
          }),
        ]),
      ),
    );

    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    await Promise.resolve();
    await Promise.resolve();

    const snapshot = capture.getSnapshot();

    expect(snapshot.snapshotStatus).toBe("loaded");
    expect(snapshot.entries.map((entry) => entry.url)).toEqual([
      "https://api.example.com/promised",
    ]);
  });

  it("deduplicates live requests with the initial snapshot", () => {
    const mock = createMockApi();
    const deferred = createDeferredHar();

    mock.getHAR.mockImplementation(deferred.implementation);

    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    const live = makeHarEntry({
      request: { url: "https://api.example.com/live" },
      response: { status: 200 },
    });
    const seeded = makeHarEntry({
      request: { url: "https://api.example.com/seeded" },
      response: { status: 200 },
    });

    mock.emit(live);
    expect(
      capture.getSnapshot().entries.map((entry) => entry.url),
    ).toEqual(["https://api.example.com/live"]);

    deferred.resolve(makeHarLog([seeded, live]));

    const snapshot = capture.getSnapshot();

    expect(snapshot.snapshotStatus).toBe("loaded");
    expect(snapshot.entries.map((entry) => entry.url)).toEqual([
      "https://api.example.com/seeded",
      "https://api.example.com/live",
    ]);
  });

  it("pauses without dropping entries and resumes capture", () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    const first = makeHarEntry({
      request: { url: "https://api.example.com/first" },
    });
    const paused = makeHarEntry({
      request: { url: "https://api.example.com/paused" },
    });
    const resumed = makeHarEntry({
      request: { url: "https://api.example.com/resumed" },
    });

    mock.emit(first);
    capture.pause();

    expect(capture.getSnapshot().status).toBe("paused");

    mock.emit(paused);
    expect(capture.getSnapshot().entries).toHaveLength(1);

    capture.resume();
    expect(capture.getSnapshot().status).toBe("running");

    mock.emit(resumed);
    expect(
      capture.getSnapshot().entries.map((entry) => entry.url),
    ).toEqual([
      "https://api.example.com/first",
      "https://api.example.com/resumed",
    ]);
  });

  it("clears captured entries without stopping capture", () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    mock.emit(
      makeHarEntry({
        request: { url: "https://api.example.com/first" },
      }),
    );
    capture.clear();

    expect(capture.getSnapshot().entries).toHaveLength(0);
    expect(capture.getSnapshot().status).toBe("running");

    mock.emit(
      makeHarEntry({
        request: { url: "https://api.example.com/second" },
      }),
    );

    expect(
      capture.getSnapshot().entries.map((entry) => entry.url),
    ).toEqual(["https://api.example.com/second"]);
  });

  it("loads response content on demand from the retained request handle", async () => {
    const mock = createMockApi();
    const getContent = vi.fn(
      (callback?: (content: string, encoding: string) => void) => {
        callback?.("response body", "");
      },
    );
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    mock.emit(makeHarEntry({ getContent }));

    const entry = capture.getSnapshot().entries[0];
    if (!entry) throw new Error("Expected a captured entry.");

    expect(getContent).not.toHaveBeenCalled();

    await expect(
      capture.loadResponseContent(entry.id),
    ).resolves.toEqual({
      status: "ok",
      content: "response body",
      encoding: null,
    });

    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it("supports promise-based response content", async () => {
    const mock = createMockApi();
    const getContent = vi.fn(() =>
      Promise.resolve({ content: "promised", encoding: "base64" }),
    );
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    mock.emit(makeHarEntry({ getContent }));

    const entry = capture.getSnapshot().entries[0];
    if (!entry) throw new Error("Expected a captured entry.");

    await expect(
      capture.loadResponseContent(entry.id),
    ).resolves.toEqual({
      status: "ok",
      content: "promised",
      encoding: "base64",
    });
  });

  it("reports unavailable content when the HAR entry has no accessor", async () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    mock.emit(makeHarEntry());

    const entry = capture.getSnapshot().entries[0];
    if (!entry) throw new Error("Expected a captured entry.");

    await expect(
      capture.loadResponseContent(entry.id),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("reports failed content retrieval", async () => {
    const mock = createMockApi();
    const getContent = vi.fn(() => {
      throw new Error("content failed");
    });
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    mock.emit(makeHarEntry({ getContent }));

    const entry = capture.getSnapshot().entries[0];
    if (!entry) throw new Error("Expected a captured entry.");

    await expect(
      capture.loadResponseContent(entry.id),
    ).resolves.toEqual({ status: "failed" });
  });

  it("deduplicates simultaneous response content loads", async () => {
    const mock = createMockApi();
    const pending: {
      resolve: ((content: string, encoding: string) => void) | null;
    } = { resolve: null };
    const getContent = vi.fn(
      (callback?: (content: string, encoding: string) => void) => {
        pending.resolve = callback ?? null;
      },
    );
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    mock.emit(makeHarEntry({ getContent }));

    const entry = capture.getSnapshot().entries[0];
    if (!entry) throw new Error("Expected a captured entry.");

    const first = capture.loadResponseContent(entry.id);
    const second = capture.loadResponseContent(entry.id);

    expect(second).toBe(first);
    expect(getContent).toHaveBeenCalledTimes(1);

    pending.resolve?.("once", "");

    await expect(first).resolves.toEqual({
      status: "ok",
      content: "once",
      encoding: null,
    });
  });

  it("drops response content accessors when entries are cleared", async () => {
    const mock = createMockApi();
    const getContent = vi.fn(
      (callback?: (content: string, encoding: string) => void) => {
        callback?.("body", "");
      },
    );
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    mock.emit(makeHarEntry({ getContent }));

    const entry = capture.getSnapshot().entries[0];
    if (!entry) throw new Error("Expected a captured entry.");

    capture.clear();

    await expect(
      capture.loadResponseContent(entry.id),
    ).resolves.toEqual({ status: "unavailable" });

    expect(getContent).not.toHaveBeenCalled();
  });

  it("stops capture, removes the listener, and keeps existing entries", () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    const first = makeHarEntry({
      request: { url: "https://api.example.com/first" },
    });
    const afterStop = makeHarEntry({
      request: { url: "https://api.example.com/after-stop" },
    });

    mock.emit(first);
    const listener = mock.getListener();

    expect(listener).not.toBeNull();

    capture.stop();

    expect(mock.removeListener).toHaveBeenCalledTimes(1);
    expect(mock.removeListener).toHaveBeenCalledWith(listener);

    const snapshot = capture.getSnapshot();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.snapshotStatus).toBe("idle");
    expect(snapshot.entries.map((entry) => entry.url)).toEqual([
      "https://api.example.com/first",
    ]);

    mock.emit(afterStop);
    expect(capture.getSnapshot().entries).toHaveLength(1);

    capture.stop();
    expect(mock.removeListener).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });
    const states: NetworkCaptureState[] = [];
    const unsubscribe = capture.subscribe((state) => {
      states.push(state);
    });

    capture.start();
    mock.emit(
      makeHarEntry({
        request: { url: "https://api.example.com/first" },
      }),
    );
    capture.pause();
    capture.clear();

    expect(states.map((state) => state.status)).toEqual([
      "running",
      "running",
      "paused",
      "paused",
    ]);
    expect(
      states.map((state) => state.entries.length),
    ).toEqual([0, 1, 1, 0]);

    unsubscribe();
    capture.resume();
    mock.emit(
      makeHarEntry({
        request: { url: "https://api.example.com/second" },
      }),
    );

    expect(states).toHaveLength(4);
    expect(
      capture.getSnapshot().entries.map((entry) => entry.url),
    ).toEqual(["https://api.example.com/second"]);
  });

  it("continues live capture when the initial snapshot fails", () => {
    const mock = createMockApi();
    mock.getHAR.mockImplementation(() => {
      throw new Error("HAR failed");
    });

    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    const snapshot = capture.getSnapshot();
    expect(snapshot.status).toBe("running");
    expect(snapshot.snapshotStatus).toBe("failed");

    mock.emit(
      makeHarEntry({
        request: { url: "https://api.example.com/live" },
      }),
    );

    expect(capture.getSnapshot().entries).toHaveLength(1);
    expect(capture.getSnapshot().snapshotStatus).toBe("failed");
  });

  it("continues live capture when getHAR is unavailable", () => {
    const mock = createMockApi();
    const api: NetworkCaptureApi = {
      onRequestFinished: mock.api.onRequestFinished,
    };
    const capture = createNetworkCapture({ network: api });

    capture.start();

    const snapshot = capture.getSnapshot();
    expect(snapshot.status).toBe("running");
    expect(snapshot.snapshotStatus).toBe("failed");

    mock.emit(
      makeHarEntry({
        request: { url: "https://api.example.com/live" },
      }),
    );

    expect(capture.getSnapshot().entries).toHaveLength(1);
  });

  it("reports unavailable when the DevTools network API is missing", () => {
    const capture = createNetworkCapture({ network: null });

    capture.start();

    expect(capture.getSnapshot()).toMatchObject({
      status: "unavailable",
      snapshotStatus: "failed",
    });

    capture.stop();
    expect(capture.getSnapshot().status).toBe("idle");
  });

  it("does not add duplicate listeners across repeated starts", () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });

    capture.start();
    capture.start();

    expect(mock.addListener).toHaveBeenCalledTimes(1);

    capture.stop();
    capture.start();

    expect(mock.addListener).toHaveBeenCalledTimes(2);
    expect(mock.removeListener).toHaveBeenCalledTimes(1);
  });

  it("ignores a snapshot that resolves after capture stops", () => {
    const mock = createMockApi();
    const deferred = createDeferredHar();

    mock.getHAR.mockImplementation(deferred.implementation);

    const capture = createNetworkCapture({ network: mock.api });
    capture.start();
    capture.stop();

    deferred.resolve(makeHarLog([makeHarEntry()]));

    const snapshot = capture.getSnapshot();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.entries).toHaveLength(0);
  });

  it("keeps the bounded collection limit during live capture", () => {
    const mock = createMockApi();
    const capture = createNetworkCapture({ network: mock.api });
    capture.start();

    for (let index = 0; index <= NETWORK_ENTRY_LIMIT; index += 1) {
      mock.emit(
        makeHarEntry({
          request: {
            url: `https://api.example.com/${index}`,
          },
        }),
      );
    }

    const snapshot = capture.getSnapshot();

    expect(snapshot.entries).toHaveLength(NETWORK_ENTRY_LIMIT);
    expect(snapshot.entries[0]?.url).toBe(
      "https://api.example.com/1",
    );
    expect(snapshot.entries.at(-1)?.url).toBe(
      `https://api.example.com/${NETWORK_ENTRY_LIMIT}`,
    );
  });
});
