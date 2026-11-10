import { useEffect, useState } from "react";
import { AppShell } from "../components";
import { MODULE_SCREENS } from "../features/registry";
import {
  DEFAULT_MODULE_ID,
  isModuleId,
  moduleFromHash,
} from "../shared/modules";

export function WorkspaceApp() {
  const [activeId, setActiveId] = useState(() =>
    moduleFromHash(window.location.hash),
  );

  useEffect(() => {
    const route = window.location.hash
      .replace(/^#\/?/, "")
      .split(/[/?]/, 1)[0] ?? "";

    if (!window.location.hash || !isModuleId(route)) {
      window.history.replaceState(
        null,
        "",
        `#/${DEFAULT_MODULE_ID}`,
      );
    }

    const handleHashChange = () => {
      setActiveId(moduleFromHash(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const Screen = MODULE_SCREENS[activeId];

  return (
    <AppShell activeId={activeId}>
      <Screen />
    </AppShell>
  );
}
