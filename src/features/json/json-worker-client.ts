import {
  runJsonAction,
  type JsonAction,
  type JsonIndent,
  type JsonResult,
} from "./json-core";
import type {
  JsonWorkerRequest,
  JsonWorkerResponse,
} from "./json-worker-protocol";

export interface JsonActionRequest {
  action: JsonAction;
  input: string;
  indent: JsonIndent;
}

interface PendingRequest {
  request: JsonActionRequest;
  resolve: (result: JsonResult) => void;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function processSynchronously(request: JsonActionRequest): JsonResult {
  return runJsonAction(request.action, request.input, request.indent);
}

function failWorker(): void {
  workerUnavailable = true;
  worker?.terminate();
  worker = null;

  const requests = Array.from(pending.values());
  pending.clear();

  for (const entry of requests) {
    entry.resolve(processSynchronously(entry.request));
  }
}

function getWorker(): Worker | null {
  if (workerUnavailable || typeof Worker === "undefined") return null;
  if (worker) return worker;

  try {
    const created = new Worker(new URL("./json-worker.ts", import.meta.url), {
      type: "module",
    });

    created.onmessage = (event: MessageEvent<JsonWorkerResponse>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;

      pending.delete(event.data.id);
      entry.resolve(event.data.result);
    };

    created.onerror = () => {
      failWorker();
    };

    worker = created;
    return created;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

export function processJson(
  request: JsonActionRequest,
): Promise<JsonResult> {
  const target = getWorker();
  if (!target) {
    return Promise.resolve(processSynchronously(request));
  }

  return new Promise((resolve) => {
    const id = nextRequestId;
    nextRequestId += 1;
    pending.set(id, { request, resolve });

    try {
      const message: JsonWorkerRequest = { id, ...request };
      target.postMessage(message);
    } catch {
      pending.delete(id);
      resolve(processSynchronously(request));
    }
  });
}
