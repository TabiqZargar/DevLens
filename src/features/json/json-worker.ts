import { runJsonAction, type JsonResult } from "./json-core";
import type {
  JsonWorkerRequest,
  JsonWorkerResponse,
} from "./json-worker-protocol";

interface JsonWorkerScope {
  onmessage: ((event: MessageEvent<JsonWorkerRequest>) => void) | null;
  postMessage(message: JsonWorkerResponse): void;
}

const scope = globalThis as unknown as JsonWorkerScope;

function processingFailure(error: unknown): JsonResult {
  return {
    ok: false,
    empty: false,
    error: {
      message: "JSON processing failed unexpectedly.",
      detail: error instanceof Error ? error.message : String(error),
      offset: null,
      line: null,
      column: null,
    },
  };
}

scope.onmessage = (event) => {
  const { id, action, input, indent } = event.data;

  let result: JsonResult;
  try {
    result = runJsonAction(action, input, indent);
  } catch (error) {
    result = processingFailure(error);
  }

  scope.postMessage({ id, result });
};
