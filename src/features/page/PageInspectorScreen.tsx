import { ModuleScaffold } from "../../components/module-scaffold";
import { getModuleDefinition } from "../../shared/modules";

const module = getModuleDefinition("page");

export function PageInspectorScreen() {
  return (
    <ModuleScaffold
      module={module}
      summary="Connect the request you are debugging to the page that produced it."
      planned={[
        "Inspect title, URL, metadata, and Open Graph tags.",
        "Summarize assets, scripts, and render-blocking resources.",
        "Surface accessibility landmarks and missing labels.",
        "Run only after an explicit user action.",
      ]}
      note="Content script registration is intentionally deferred so the foundation does not request access to every page."
    />
  );
}
