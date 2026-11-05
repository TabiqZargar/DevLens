import {
  isRuntimeRequest,
  type PingPayload,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../shared/messaging";
import {
  API_EXECUTION_MESSAGE,
  isApiExecutionMessage,
  parseApiExecutionRequest,
  type ApiExecutionResponse,
} from "../features/api/api-execution";

export type BackgroundResponse =
  | RuntimeResponse<unknown>
  | ApiExecutionResponse;

export async function handleRuntimeMessage(
  request: RuntimeRequest,
): Promise<RuntimeResponse<unknown>> {
  switch (request.type) {
    case "devlens:ping": {
      const payload: PingPayload = {
        service: "background",
        timestamp: new Date().toISOString(),
      };
      return { ok: true, data: payload };
    }
    default:
      return { ok: false, error: "Unsupported request." };
  }
}

export async function handleApiExecutionMessage(
  message: unknown,
): Promise<ApiExecutionResponse> {
  const parsed = parseApiExecutionRequest(message);

  if (!parsed.ok) {
    return {
      type: API_EXECUTION_MESSAGE,
      requestId: parsed.requestId,
      ok: false,
      error: parsed.error,
    };
  }

  return {
    type: API_EXECUTION_MESSAGE,
    requestId: parsed.request.requestId,
    ok: false,
    error: {
      code: "not-implemented",
      message: "Request execution is not implemented yet.",
    },
  };
}

export async function handleBackgroundMessage(
  message: unknown,
): Promise<BackgroundResponse> {
  if (isApiExecutionMessage(message)) {
    return handleApiExecutionMessage(message);
  }

  if (isRuntimeRequest(message)) {
    return handleRuntimeMessage(message);
  }

  return { ok: false, error: "Unsupported request." };
}
