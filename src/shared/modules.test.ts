import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODULE_ID,
  getModuleDefinition,
  isModuleId,
  moduleFromHash,
  MODULES,
} from "./modules";

describe("module registry", () => {
  it("has unique ids and complete definitions", () => {
    const ids = MODULES.map((module) => module.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const module of MODULES) {
      expect(module.name.length).toBeGreaterThan(0);
      expect(module.tagline.length).toBeGreaterThan(0);
      expect(module.milestone).toMatch(/^Milestone \d+$/);
    }
  });

  it("resolves known and unknown hash routes", () => {
    expect(moduleFromHash("#/jwt")).toBe("jwt");
    expect(moduleFromHash("#/unknown")).toBe(DEFAULT_MODULE_ID);
    expect(moduleFromHash("")).toBe(DEFAULT_MODULE_ID);
  });

  it("guards module ids", () => {
    expect(isModuleId("api")).toBe(true);
    expect(isModuleId("nope")).toBe(false);
    expect(getModuleDefinition("json").name).toBe("JSON Studio");
  });
});
