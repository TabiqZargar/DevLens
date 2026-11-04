import { STORAGE_KEYS } from "../shared/constants";
import {
  DEFAULT_SETTINGS,
  type DevLensSettings,
} from "../shared/settings";
import { readStoredValue, writeStoredValue } from "./storage";

export async function loadSettings(): Promise<DevLensSettings> {
  const stored = await readStoredValue<Partial<DevLensSettings>>(
    STORAGE_KEYS.settings,
    {},
  );
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(
  settings: DevLensSettings,
): Promise<void> {
  await writeStoredValue(STORAGE_KEYS.settings, settings);
}
