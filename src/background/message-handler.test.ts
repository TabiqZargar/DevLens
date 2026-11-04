import { describe, expect, it } from "vitest";
import { handleRuntimeMessage } from "./message-handler";

describe("background message handler", () => {
  it("answers ping requests with worker metadata", async () => {
    const response = await handleRuntimeMessage({ type: "devlens:ping" });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data).toMatchObject({ service: "background" });
    }
  });

  it("rejects unsupported message shapes", async () => {
    const response = await handleRuntimeMessage({
      type: "devlens:unknown",
    } as never);

    expect(response).toEqual({
      ok: false,
      error: "Unsupported request.",
    });
  });
});
