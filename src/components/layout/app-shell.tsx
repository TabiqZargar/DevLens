import { useEffect, useRef, type ReactNode } from "react";
import { APP_VERSION } from "../../shared/constants";
import {
  getModuleDefinition,
  MODULES,
  type ModuleDefinition,
  type ModuleId,
} from "../../shared/modules";
import { Badge } from "../badge";
import { cn } from "../cn";
import { ChevronRightIcon, LockIcon, ModuleIcon } from "../icons";
import { Brand } from "../logo";

function NavLink({
  module,
  active,
}: {
  module: ModuleDefinition;
  active: boolean;
}) {
  return (
    <a
      href={`#/${module.id}`}
      aria-current={active ? "page" : undefined}
      title={module.tagline}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-raised text-ink"
          : "text-muted hover:bg-white/[0.03] hover:text-ink",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded border transition-colors",
          active
            ? "border-line-strong bg-surface text-accent-strong"
            : "border-line bg-base text-faint group-hover:text-muted",
        )}
      >
        <ModuleIcon id={module.id} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-5">
          {module.name}
        </span>
        <span className="block truncate text-[10px] uppercase tracking-[0.12em] text-faint">
          {module.milestone}
        </span>
      </span>
    </a>
  );
}

export function AppShell({
  activeId,
  children,
}: {
  activeId: ModuleId;
  children: ReactNode;
}) {
  const activeModule = getModuleDefinition(activeId);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [activeId]);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <a
        href="#workspace-main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-sm font-medium text-[#0b0d12] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-base p-4 md:flex">
        <Brand />
        <div className="mt-6 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
          Modules
        </div>
        <nav aria-label="Modules" className="mt-2 flex flex-1 flex-col gap-0.5">
          {MODULES.map((module) => (
            <NavLink
              key={module.id}
              module={module}
              active={module.id === activeId}
            />
          ))}
        </nav>
        <div className="rounded-md border border-line bg-surface p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-ink">
            <LockIcon className="size-3.5 text-cyan" />
            Local-first
          </div>
          <p className="mt-1 text-[11px] leading-5 text-faint">
            Data stays in this browser. AI requests go only to your Ollama
            endpoint.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas">
          <div className="flex h-14 items-center justify-between gap-4 px-5 md:px-7">
            <div className="flex items-center gap-3 md:hidden">
              <Brand compact />
            </div>
            <div className="hidden items-center gap-2 text-xs text-faint md:flex">
              <span>Workspace</span>
              <ChevronRightIcon className="size-3" />
              <span className="font-medium text-muted">
                {activeModule.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="hidden sm:inline-flex">
                Local-first
              </Badge>
              <Badge variant="outline">v{APP_VERSION}</Badge>
            </div>
          </div>
          <nav
            aria-label="Modules"
            className="lens-scrollbar flex gap-1.5 overflow-x-auto border-t border-line px-5 py-2 md:hidden"
          >
            {MODULES.map((module) => (
              <a
                key={module.id}
                href={`#/${module.id}`}
                aria-current={module.id === activeId ? "page" : undefined}
                title={module.tagline}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                  module.id === activeId
                    ? "bg-raised text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                {module.name}
              </a>
            ))}
          </nav>
        </header>

        <main
          ref={mainRef}
          id="workspace-main"
          tabIndex={-1}
          className="lens-scrollbar flex-1 overflow-y-auto bg-canvas px-5 py-6 md:px-7 md:py-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
