import {
  isPageMetadataRequest,
  type PageMetadata,
} from "../shared/messaging";

if (
  typeof chrome !== "undefined" &&
  typeof chrome.runtime?.onMessage !== "undefined"
) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isPageMetadataRequest(message)) {
      return false;
    }

    const metadata: PageMetadata = {
      title: document.title,
      url: window.location.href,
      capturedAt: new Date().toISOString(),
    };

    sendResponse({ ok: true, data: metadata });
    return false;
  });
}
