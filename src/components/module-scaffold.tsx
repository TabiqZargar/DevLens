import type { ModuleDefinition } from "../shared/modules";
import { Badge } from "./badge";
import { Card } from "./card";
import { ModuleIcon } from "./icons";
import { PageHeader } from "./page-header";

export interface ModuleScaffoldProps {
  module: ModuleDefinition;
  summary: string;
  planned: readonly string[];
  note: string;
}

export function ModuleScaffold({
  module,
  summary,
  planned,
  note,
}: ModuleScaffoldProps) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description={summary}
        actions={<Badge variant="warning">Scaffolded</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent-strong">
              <ModuleIcon id={module.id} className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                {module.name}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {module.description}
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
              Planned capability
            </h3>
            <ul className="mt-3 grid gap-2.5">
              {planned.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm leading-6 text-muted"
                >
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent/70" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            Module status
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-faint">Milestone</dt>
              <dd className="text-right text-ink">{module.milestone}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-faint">Surface</dt>
              <dd className="text-right capitalize text-ink">
                {module.surface}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-faint">State</dt>
              <dd className="text-right text-warning">Scaffolded</dd>
            </div>
          </dl>
          <p className="mt-auto border-t border-line pt-6 text-xs leading-5 text-faint">
            {note}
          </p>
        </Card>
      </div>
    </section>
  );
}
