import { handleBackgroundMessage } from "./message-handler";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleBackgroundMessage(message)
    .then(sendResponse)
    .catch(() => {
      sendResponse({
        ok: false,
        error: "Unexpected background error.",
      });
    });

  return true;
});
