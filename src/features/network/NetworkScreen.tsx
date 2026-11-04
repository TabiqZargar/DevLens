import { ModuleScaffold } from "../../components/module-scaffold";
import { getModuleDefinition } from "../../shared/modules";

const module = getModuleDefinition("network");

export function NetworkScreen() {
  return (
    <ModuleScaffold
      module={module}
      summary="The network engine lives in Chrome DevTools, where it can observe the inspected tab without asking for access to every site."
      planned={[
        "Capture fetch, XHR, document, and WebSocket activity inside DevTools.",
        "Filter by resource type, status, domain, and response time.",
        "Inspect headers, payloads, timings, and request initiators.",
        "Copy requests as cURL or export a session as HAR.",
      ]}
      note="Open DevTools (F12 or Cmd+Option+I), select the DevLens Network panel, and interact with the inspected page. This workspace route is only an overview."
    />
  );
}
