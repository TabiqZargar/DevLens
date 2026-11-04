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
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm transition",
        active
          ? "bg-accent/10 text-ink ring-1 ring-inset ring-accent/25"
          : "text-muted hover:bg-white/[0.04] hover:text-ink",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border transition",
          active
            ? "border-accent/30 bg-accent/15 text-accent-strong"
            : "border-line bg-surface text-faint group-hover:text-muted",
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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-base/90 p-5 md:flex">
        <Brand />
        <div className="mt-8 px-2 text-[10px] font-medium uppercase tracking-[0.22em] text-faint">
          Modules
        </div>
        <nav aria-label="Modules" className="mt-3 flex flex-1 flex-col gap-1">
          {MODULES.map((module) => (
            <NavLink
              key={module.id}
              module={module}
              active={module.id === activeId}
            />
          ))}
        </nav>
        <div className="rounded-xl border border-line bg-surface/60 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-ink">
            <LockIcon className="size-3.5 text-cyan" />
            Local-first
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-faint">
            Data stays in this browser. AI requests go only to your Ollama
            endpoint.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-5 md:px-8">
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
            className="lens-scrollbar flex gap-2 overflow-x-auto border-t border-line/70 px-5 py-2 md:hidden"
          >
            {MODULES.map((module) => (
              <a
                key={module.id}
                href={`#/${module.id}`}
                aria-current={module.id === activeId ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition",
                  module.id === activeId
                    ? "bg-accent/12 text-ink"
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
          className="lens-grid lens-scrollbar flex-1 overflow-y-auto px-5 py-8 md:px-8 md:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
