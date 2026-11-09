import {
  collectPageInspection,
  isPageInspectionRequest,
  PAGE_INSPECTION_MESSAGE,
  type PageInspectionResponse,
} from "../features/page/page-inspection";
import {
  isPageMetadataRequest,
  type PageMetadata,
} from "../shared/messaging";

const contentGlobal = globalThis as typeof globalThis & {
  __devlensContentReady?: boolean;
};

if (
  !contentGlobal.__devlensContentReady &&
  typeof chrome !== "undefined" &&
  typeof chrome.runtime?.onMessage !== "undefined"
) {
  contentGlobal.__devlensContentReady = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isPageInspectionRequest(message)) {
      let response: PageInspectionResponse;

      try {
        response = {
          type: PAGE_INSPECTION_MESSAGE,
          ok: true,
          data: collectPageInspection(document),
        };
      } catch {
        response = {
          type: PAGE_INSPECTION_MESSAGE,
          ok: false,
          error: {
            code: "inspection-failed",
            message: "DevLens could not inspect this page.",
          },
        };
      }

      sendResponse(response);
      return false;
    }

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
