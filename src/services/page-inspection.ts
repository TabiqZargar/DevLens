import {
  isPageInspectionResponse,
  PAGE_INSPECTION_MESSAGE,
  type PageInspectionErrorCode,
  type PageInspectionResponse,
} from "../features/page/page-inspection";
import { isExtensionRuntime } from "./runtime";

function failure(
  code: PageInspectionErrorCode,
  message: string,
): PageInspectionResponse {
  return {
    type: PAGE_INSPECTION_MESSAGE,
    ok: false,
    error: { code, message },
  };
}

export async function inspectPageTab(
  tabId: number | null,
): Promise<PageInspectionResponse> {
  if (tabId === null || !Number.isInteger(tabId) || tabId < 0) {
    return failure(
      "no-target",
      "Open DevLens from the toolbar popup while viewing the page you want to inspect.",
    );
  }

  if (
    !isExtensionRuntime() ||
    typeof chrome.scripting?.executeScript !== "function" ||
    typeof chrome.tabs?.sendMessage !== "function"
  ) {
    return failure(
      "runtime-unavailable",
      "Page inspection requires the installed DevLens extension.",
    );
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {
    return failure(
      "restricted",
      "DevLens cannot inspect this page. Browser pages, the Web Store, and other restricted pages are not accessible.",
    );
  }

  let response: unknown;

  try {
    response = await chrome.tabs.sendMessage(tabId, {
      type: PAGE_INSPECTION_MESSAGE,
    });
  } catch {
    return failure(
      "no-response",
      "The page did not respond to the inspection request. Reload the page and try again.",
    );
  }

  if (!isPageInspectionResponse(response)) {
    return failure(
      "invalid-response",
      "The page returned an invalid inspection result.",
    );
  }

  return response;
}
