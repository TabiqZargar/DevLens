export function originPatternForUrl(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return `${parsed.protocol}//${parsed.hostname}/*`;
}

function hasPermissionsApi(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.permissions !== "undefined"
  );
}

export async function hasOriginPermission(url: string): Promise<boolean> {
  const pattern = originPatternForUrl(url);
  if (!pattern) return false;

  if (
    !hasPermissionsApi() ||
    typeof chrome.permissions.contains !== "function"
  ) {
    return false;
  }

  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

export async function requestOriginPermission(
  url: string,
): Promise<boolean> {
  const pattern = originPatternForUrl(url);
  if (!pattern) return false;

  if (
    !hasPermissionsApi() ||
    typeof chrome.permissions.request !== "function"
  ) {
    return false;
  }

  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}
