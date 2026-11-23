import type { EnvironmentEmployee } from "@t3tools/contracts";

/** Who the work on this environment is handed to, where its agent is a named employee. */
export function EmployeeCard({ employee }: { employee: EnvironmentEmployee }) {
  return (
    <div
      className="mb-5 flex max-w-md items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-left"
      data-testid="employee-card"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground font-medium text-background text-lg"
      >
        {[...employee.name][0]?.toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-foreground">{employee.name}</span>
          {employee.alias ? (
            <span className="shrink-0 text-muted-foreground text-sm">{employee.alias}</span>
          ) : null}
          {employee.title ? (
            <span className="truncate text-muted-foreground text-sm">· {employee.title}</span>
          ) : null}
        </span>
        {employee.about ? (
          <span className="mt-0.5 block text-muted-foreground text-sm">{employee.about}</span>
        ) : null}
      </span>
    </div>
  );
}
