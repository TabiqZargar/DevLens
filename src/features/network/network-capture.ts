import {
  appendNetworkEntry,
  normalizeNetworkEntry,
  type NetworkEntry,
} from "./network-model";

export type NetworkCaptureStatus =
  | "idle"
  | "running"
  | "paused"
  | "unavailable";

export type NetworkCaptureSnapshotStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "failed";

export interface NetworkCaptureState {
  status: NetworkCaptureStatus;
  snapshotStatus: NetworkCaptureSnapshotStatus;
  entries: NetworkEntry[];
}

export type NetworkCaptureListener = (
  state: NetworkCaptureState,
) => void;

export type NetworkRequestListener = (
  request: HARFormatEntry,
) => void;

export interface NetworkResponseContent {
  content: string;
  encoding: string | null;
}

export type NetworkResponseContentResult =
  | ({ status: "ok" } & NetworkResponseContent)
  | { status: "unavailable" }
  | { status: "failed" };

export interface NetworkContentLoader {
  getContent(
    callback?: (content: string, encoding: string) => void,
  ): void | Promise<{ content: string; encoding: string }>;
}

export interface NetworkCaptureApi {
  onRequestFinished: {
    addListener(listener: NetworkRequestListener): void;
    removeListener(listener: NetworkRequestListener): void;
  };
  getHAR?: (
    callback?: (harLog: HARFormatLog) => void,
  ) => void | Promise<HARFormatLog>;
}

export interface NetworkCaptureOptions {
  network?: NetworkCaptureApi | null;
}

export interface NetworkCapture {
  start(): void;
  pause(): void;
  resume(): void;
  clear(): void;
  stop(): void;
  loadResponseContent(
    entryId: string,
  ): Promise<NetworkResponseContentResult>;
  subscribe(listener: NetworkCaptureListener): () => void;
  getSnapshot(): NetworkCaptureState;
}

function resolveDevToolsNetwork(): NetworkCaptureApi | null {
  if (typeof chrome === "undefined") return null;

  const network = chrome.devtools?.network;

  if (
    !network ||
    typeof network.onRequestFinished?.addListener !== "function" ||
    typeof network.onRequestFinished?.removeListener !== "function"
  ) {
    return null;
  }

  return network as unknown as NetworkCaptureApi;
}

function readHarEntries(
  harLog: HARFormatLog | null | undefined,
): HARFormatEntry[] | null {
  if (!harLog || typeof harLog !== "object") return null;

  const record = harLog as unknown as Record<string, unknown>;
  const directEntries = record.entries;

  if (Array.isArray(directEntries)) {
    return directEntries as HARFormatEntry[];
  }

  const log = record.log;
  if (!log || typeof log !== "object") return null;

  const nestedEntries = (log as { entries?: unknown }).entries;
  return Array.isArray(nestedEntries)
    ? (nestedEntries as HARFormatEntry[])
    : null;
}

function createContentLoader(
  entry: HARFormatEntry,
): NetworkContentLoader | null {
  const record = entry as unknown as { getContent?: unknown };

  if (typeof record.getContent !== "function") return null;

  const source = record as unknown as NetworkContentLoader;

  return {
    getContent(callback) {
      return source.getContent(callback);
    },
  };
}

export function createNetworkCapture(
  options: NetworkCaptureOptions = {},
): NetworkCapture {
  const subscribers = new Set<NetworkCaptureListener>();
  // Chrome exposes getContent only on the request object, so a loader capability
  // is retained per entry. Normalized state never retains the raw HAR entry.
  const contentLoaders = new Map<string, NetworkContentLoader>();
  const inFlightLoads = new Map<
    string,
    Promise<NetworkResponseContentResult>
  >();

  let currentState: NetworkCaptureState = {
    status: "idle",
    snapshotStatus: "idle",
    entries: [],
  };
  let active = false;
  let paused = false;
  let listenerAttached = false;
  let attachedApi: NetworkCaptureApi | null = null;
  let runId = 0;

  function pruneContentLoaders(
    entries: readonly NetworkEntry[],
  ): void {
    if (contentLoaders.size === 0) return;

    const ids = new Set(entries.map((entry) => entry.id));

    for (const id of contentLoaders.keys()) {
      if (!ids.has(id)) contentLoaders.delete(id);
    }
  }

  function rememberContentLoader(
    entry: NetworkEntry,
    harEntry: HARFormatEntry,
  ): void {
    if (!entry.hasResponseContent) return;

    const loader = createContentLoader(harEntry);
    if (loader) contentLoaders.set(entry.id, loader);
  }

  function notify(): void {
    for (const subscriber of subscribers) {
      try {
        subscriber(currentState);
      } catch {
        continue;
      }
    }
  }

  function setState(next: NetworkCaptureState): void {
    currentState = next;
    notify();
  }

  function updateState(
    patch: Partial<NetworkCaptureState>,
  ): void {
    setState({ ...currentState, ...patch });
  }

  function markSnapshotFailed(run: number): void {
    if (run !== runId || !active) return;
    if (currentState.snapshotStatus !== "loading") return;

    updateState({ snapshotStatus: "failed" });
  }

  function applySnapshot(
    run: number,
    harLog: HARFormatLog | null | undefined,
  ): void {
    if (run !== runId || !active) return;
    if (currentState.snapshotStatus !== "loading") return;

    const harEntries = readHarEntries(harLog);

    if (!harEntries) {
      markSnapshotFailed(run);
      return;
    }

    let nextEntries: NetworkEntry[] = [];

    for (const harEntry of harEntries) {
      try {
        const entry = normalizeNetworkEntry(harEntry);
        rememberContentLoader(entry, harEntry);
        nextEntries = appendNetworkEntry(nextEntries, entry);
      } catch {
        continue;
      }
    }

    for (const entry of currentState.entries) {
      nextEntries = appendNetworkEntry(nextEntries, entry);
    }

    pruneContentLoaders(nextEntries);

    updateState({
      entries: nextEntries,
      snapshotStatus: "loaded",
    });
  }

  function requestSnapshot(
    api: NetworkCaptureApi,
    run: number,
  ): void {
    const getHAR = api.getHAR;

    if (typeof getHAR !== "function") {
      markSnapshotFailed(run);
      return;
    }

    let settled = false;

    const settle = (
      harLog: HARFormatLog | null | undefined,
    ): void => {
      if (settled) return;
      settled = true;
      applySnapshot(run, harLog);
    };

    try {
      const result = getHAR.call(api, (harLog) => settle(harLog));

      if (result && typeof result.then === "function") {
        result.then(
          (harLog) => settle(harLog),
          () => settle(null),
        );
      }
    } catch {
      settle(null);
    }
  }

  function handleRequestFinished(
    request: HARFormatEntry,
  ): void {
    if (!active || paused) return;

    let entry: NetworkEntry;

    try {
      entry = normalizeNetworkEntry(request);
      rememberContentLoader(entry, request);
    } catch {
      return;
    }

    if (
      currentState.entries.some(
        (existing) => existing.id === entry.id,
      )
    ) {
      return;
    }

    const nextEntries = appendNetworkEntry(
      currentState.entries,
      entry,
    );
    pruneContentLoaders(nextEntries);

    updateState({ entries: nextEntries });
  }

  function loadResponseContent(
    entryId: string,
  ): Promise<NetworkResponseContentResult> {
    const existing = inFlightLoads.get(entryId);
    if (existing) return existing;

    const loader = contentLoaders.get(entryId);
    if (!loader) {
      return Promise.resolve({ status: "unavailable" });
    }

    let resolvePromise!: (
      result: NetworkResponseContentResult,
    ) => void;
    const promise = new Promise<NetworkResponseContentResult>(
      (resolve) => {
        resolvePromise = resolve;
      },
    );

    inFlightLoads.set(entryId, promise);

    let settled = false;

    const settle = (result: NetworkResponseContentResult): void => {
      if (settled) return;
      settled = true;

      if (inFlightLoads.get(entryId) === promise) {
        inFlightLoads.delete(entryId);
      }

      resolvePromise(result);
    };

    const accept = (content: unknown, encoding: unknown): void => {
      if (typeof content !== "string") {
        settle({ status: "failed" });
        return;
      }

      settle({
        status: "ok",
        content,
        encoding:
          typeof encoding === "string" && encoding.length > 0
            ? encoding
            : null,
      });
    };

    try {
      const result = loader.getContent(accept);

      if (result && typeof result.then === "function") {
        result.then(
          (value) => {
            if (!value || typeof value !== "object") {
              settle({ status: "failed" });
              return;
            }

            const content = (value as { content?: unknown }).content;
            const encoding = (value as { encoding?: unknown }).encoding;
            accept(content, encoding);
          },
          () => settle({ status: "failed" }),
        );
      }
    } catch {
      settle({ status: "failed" });
    }

    return promise;
  }

  function start(): void {
    if (active) return;

    const api =
      options.network === undefined
        ? resolveDevToolsNetwork()
        : options.network;

    if (!api) {
      if (
        currentState.status !== "unavailable" ||
        currentState.snapshotStatus !== "failed"
      ) {
        updateState({
          status: "unavailable",
          snapshotStatus: "failed",
        });
      }
      return;
    }

    active = true;
    paused = false;
    listenerAttached = true;
    attachedApi = api;
    runId += 1;
    const run = runId;

    try {
      api.onRequestFinished.addListener(handleRequestFinished);
    } catch {
      active = false;
      listenerAttached = false;
      attachedApi = null;
      updateState({
        status: "unavailable",
        snapshotStatus: "failed",
      });
      return;
    }

    updateState({
      status: "running",
      snapshotStatus: "loading",
    });

    if (!active || run !== runId) return;

    requestSnapshot(api, run);
  }

  function pause(): void {
    if (!active || currentState.status !== "running") return;

    paused = true;
    updateState({ status: "paused" });
  }

  function resume(): void {
    if (!active || currentState.status !== "paused") return;

    paused = false;
    updateState({ status: "running" });
  }

  function clear(): void {
    contentLoaders.clear();
    inFlightLoads.clear();

    if (currentState.entries.length === 0) return;

    updateState({ entries: [] });
  }

  function stop(): void {
    const wasActive = active;
    const hadListener = listenerAttached;

    active = false;
    paused = false;
    runId += 1;

    if (hadListener && attachedApi) {
      try {
        attachedApi.onRequestFinished.removeListener(
          handleRequestFinished,
        );
      } catch {}
    }

    listenerAttached = false;
    attachedApi = null;
    contentLoaders.clear();
    inFlightLoads.clear();

    if (
      wasActive ||
      hadListener ||
      currentState.status !== "idle" ||
      currentState.snapshotStatus !== "idle"
    ) {
      updateState({
        status: "idle",
        snapshotStatus: "idle",
      });
    }
  }

  function subscribe(
    listener: NetworkCaptureListener,
  ): () => void {
    subscribers.add(listener);

    return () => {
      subscribers.delete(listener);
    };
  }

  return {
    start,
    pause,
    resume,
    clear,
    stop,
    loadResponseContent,
    subscribe,
    getSnapshot: () => currentState,
  };
}
