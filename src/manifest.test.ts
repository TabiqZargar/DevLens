import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const manifestUrl = resolve(projectRoot, "public/manifest.json");
const packageUrl = resolve(projectRoot, "package.json");

interface Manifest {
  manifest_version: number;
  version: string;
  permissions: string[];
  host_permissions?: string[];
  background: { service_worker: string; type: string };
  action: { default_popup: string };
  devtools_page: string;
  icons: Record<string, string>;
}

describe("Manifest V3 contract", () => {
  it("keeps the manifest and package versions aligned", async () => {
    const [manifest, pkg] = await Promise.all([
      readFile(manifestUrl, "utf8"),
      readFile(packageUrl, "utf8"),
    ]);

    expect((JSON.parse(manifest) as Manifest).version).toBe(
      (JSON.parse(pkg) as { version: string }).version,
    );
  });

  it("declares MV3 with minimal permissions", async () => {
    const manifest = JSON.parse(
      await readFile(manifestUrl, "utf8"),
    ) as Manifest;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.background.type).toBe("module");
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(manifest.devtools_page).toBe("devtools.html");
  });

  it("ships every declared icon", async () => {
    const manifest = JSON.parse(
      await readFile(manifestUrl, "utf8"),
    ) as Manifest;

    for (const path of Object.values(manifest.icons)) {
      await expect(
        access(resolve(projectRoot, "public", path)),
      ).resolves.toBeUndefined();
    }
  });
});
