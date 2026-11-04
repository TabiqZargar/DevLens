function hasChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.storage !== "undefined" &&
    typeof chrome.storage.local !== "undefined"
  );
}

function hasBrowserStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

export async function readStoredValue<T>(
  key: string,
  fallback: T,
): Promise<T> {
  try {
    if (hasChromeStorage()) {
      const stored = (await chrome.storage.local.get(key)) as Record<
        string,
        unknown
      >;
      return (stored[key] as T | undefined) ?? fallback;
    }

    if (hasBrowserStorage()) {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export async function writeStoredValue<T>(
  key: string,
  value: T,
): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  if (hasBrowserStorage()) {
    window.localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  throw new Error("No storage backend is available.");
}
