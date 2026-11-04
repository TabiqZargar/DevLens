import { useEffect, useState } from "react";
import { AppShell } from "../components";
import { MODULE_SCREENS } from "../features/registry";
import { moduleFromHash } from "../shared/modules";

export function WorkspaceApp() {
  const [activeId, setActiveId] = useState(() =>
    moduleFromHash(window.location.hash),
  );

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/json");
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
