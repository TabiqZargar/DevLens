export interface DevLensSettings {
  ollamaEndpoint: string;
  ollamaModel: string;
}

export const DEFAULT_SETTINGS: Readonly<DevLensSettings> = {
  ollamaEndpoint: "http://127.0.0.1:11434",
  ollamaModel: "",
};
