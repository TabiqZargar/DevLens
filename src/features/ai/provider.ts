export interface LocalAiModel {
  name: string;
  sizeBytes?: number;
  modifiedAt?: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export type LocalAiConnectionErrorCode =
  | "invalid-endpoint"
  | "permission-denied"
  | "network-error"
  | "timeout"
  | "http-error"
  | "invalid-response"
  | "response-too-large";

export interface LocalAiConnectionError {
  code: LocalAiConnectionErrorCode;
  message: string;
}

export type LocalAiConnectionResult =
  | {
      ok: true;
      endpoint: string;
      models: LocalAiModel[];
      durationMs: number;
    }
  | {
      ok: false;
      error: LocalAiConnectionError;
    };

export type LocalAiChatRole = "system" | "user" | "assistant";

export interface LocalAiChatMessage {
  role: LocalAiChatRole;
  content: string;
}

export type LocalAiChatErrorCode =
  | "invalid-endpoint"
  | "missing-model"
  | "invalid-request"
  | "permission-denied"
  | "network-error"
  | "timeout"
  | "aborted"
  | "http-error"
  | "invalid-response"
  | "empty-response"
  | "incomplete-response"
  | "response-too-large";

export interface LocalAiChatError {
  code: LocalAiChatErrorCode;
  message: string;
}

export interface LocalAiChatRequest {
  endpoint: string;
  model: string;
  messages: readonly LocalAiChatMessage[];
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

export type LocalAiChatResult =
  | {
      ok: true;
      content: string;
      model: string | null;
      durationMs: number;
    }
  | {
      ok: false;
      error: LocalAiChatError;
      partialContent: string;
    };

export interface LocalAiProvider {
  readonly id: string;
  checkConnection(endpoint: string): Promise<LocalAiConnectionResult>;
  chat(request: LocalAiChatRequest): Promise<LocalAiChatResult>;
}
