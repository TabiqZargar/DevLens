import { version } from "../../package.json";

export const APP_NAME = "DevLens";
export const APP_VERSION = version;

export const STORAGE_KEYS = {
  settings: "devlens:settings",
} as const;
