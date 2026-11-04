import type {
  PingPayload,
  RuntimeRequest,
  RuntimeResponse,
} from "../shared/messaging";

export async function handleRuntimeMessage(
  request: RuntimeRequest,
): Promise<RuntimeResponse<unknown>> {
  switch (request.type) {
    case "devlens:ping": {
      const payload: PingPayload = {
        service: "background",
        timestamp: new Date().toISOString(),
      };
      return { ok: true, data: payload };
    }
    default:
      return { ok: false, error: "Unsupported request." };
  }
}
