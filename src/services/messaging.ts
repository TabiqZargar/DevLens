import type { RuntimeRequest, RuntimeResponse } from "../shared/messaging";
import { isExtensionRuntime } from "./runtime";

export async function sendRuntimeMessage<T>(
  request: RuntimeRequest,
): Promise<RuntimeResponse<T>> {
  if (
    !isExtensionRuntime() ||
    typeof chrome.runtime.sendMessage !== "function"
  ) {
    return { ok: false, error: "Extension runtime unavailable." };
  }

  try {
    return (await chrome.runtime.sendMessage(request)) as RuntimeResponse<T>;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The background worker did not respond.",
    };
  }
}
