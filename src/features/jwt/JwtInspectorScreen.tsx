import { ModuleScaffold } from "../../components/module-scaffold";
import { getModuleDefinition } from "../../shared/modules";

const module = getModuleDefinition("jwt");

export function JwtInspectorScreen() {
  return (
    <ModuleScaffold
      module={module}
      summary="Decode a token in place and understand its claims, lifetime, and trust boundaries."
      planned={[
        "Decode header and payload without contacting a server.",
        "Surface exp, nbf, and iat values with clock-skew warnings.",
        "Explain registered claims and flag malformed segments.",
        "Copy individual claims or the decoded JSON.",
      ]}
      note="Signature verification will stay local and optional. DevLens will never transmit a token."
    />
  );
}
