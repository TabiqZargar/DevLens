if (
  typeof chrome !== "undefined" &&
  typeof chrome.devtools?.panels !== "undefined"
) {
  chrome.devtools.panels.create(
    "DevLens Network",
    "icons/icon48.png",
    "panel.html",
  );
}
