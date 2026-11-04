import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/services/storage.test.ts"],
          sequence: { groupOrder: 0 },
        },
      },
      {
        plugins: [react()],
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", "src/services/storage.test.ts"],
          setupFiles: ["./src/test/setup.ts"],
          restoreMocks: true,
          isolate: false,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
