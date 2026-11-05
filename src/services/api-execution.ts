import {
  API_EXECUTION_MESSAGE,
  isApiExecutionResponse,
  type ApiExecutionErrorCode,
  type ApiExecutionRequest,
  type ApiExecutionResponse,
} from "../features/api/api-execution";
import { isExtensionRuntime } from "./runtime";

function failure(
  requestId: string | null,
  code: ApiExecutionErrorCode,
  message: string,
): ApiExecutionResponse {
  return {
    type: API_EXECUTION_MESSAGE,
    requestId,
    ok: false,
    error: { code, message },
  };
}

export async function sendApiExecutionMessage(
  request: ApiExecutionRequest,
): Promise<ApiExecutionResponse> {
  if (
    !isExtensionRuntime() ||
    typeof chrome.runtime.sendMessage !== "function"
  ) {
    return failure(
      request.requestId,
      "runtime-unavailable",
      "Extension runtime unavailable.",
    );
  }

  let response: unknown;

  try {
    response = await chrome.runtime.sendMessage(request);
  } catch {
    return failure(
      request.requestId,
      "runtime-error",
      "The background worker did not respond.",
    );
  }

  if (
    !isApiExecutionResponse(response) ||
    response.requestId !== request.requestId
  ) {
    return failure(
      request.requestId,
      "invalid-response",
      "The background worker returned an invalid response.",
    );
  }

  return response;
}
