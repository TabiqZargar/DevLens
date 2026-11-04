import { ModuleScaffold } from "../../components/module-scaffold";
import { getModuleDefinition } from "../../shared/modules";

const module = getModuleDefinition("api");

export function ApiBuilderScreen() {
  return (
    <ModuleScaffold
      module={module}
      summary="Compose real requests, send them from the extension, and keep the useful ones close."
      planned={[
        "Build method, URL, headers, query, and body in a focused editor.",
        "Send through the background worker with per-origin permission requests.",
        "Replay requests and keep collections in local storage.",
        "Copy a request as cURL or fetch.",
      ]}
      note="Cross-origin requests require optional host permissions, requested only when you first send to an origin."
    />
  );
}
