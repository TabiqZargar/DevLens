import { ModuleScaffold } from "../../components/module-scaffold";
import { getModuleDefinition } from "../../shared/modules";

const module = getModuleDefinition("ai");

export function LocalAiScreen() {
  return (
    <ModuleScaffold
      module={module}
      summary="Ask Ollama about a payload while both the data and the model stay on your machine."
      planned={[
        "Connect to a local Ollama endpoint, defaulting to 127.0.0.1:11434.",
        "Stream explanations for JSON and network payloads.",
        "Keep conversation context in memory with an explicit clear action.",
        "Degrade gracefully when Ollama is not running.",
      ]}
      note="No cloud AI, API keys, or telemetry. The assistant only talks to the endpoint stored on this device."
    />
  );
}
