import { isRuntimeRequest } from "../shared/messaging";
import { handleRuntimeMessage } from "./message-handler";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isRuntimeRequest(message)) {
    return false;
  }

  handleRuntimeMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error:
          error instanceof Error ? error.message : "Unexpected background error.",
      });
    });

  return true;
});
