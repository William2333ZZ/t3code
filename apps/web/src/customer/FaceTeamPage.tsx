import { T, useGT } from "gt-react";

import { usePrimaryEnvironmentId } from "../state/environments";
import { useEnvironmentIdentities } from "../state/session";
import { Companion } from "./Companion";
import {
  busiestWorkState,
  companionAnimation,
  employeeWorkState,
  type EmployeeWorkState,
} from "./companion.logic";
import { usePrimaryEmployee } from "./CustomerHome";
import { useCustomerFace } from "./customerFace";
import { OpsTeamPage } from "./OpsPanels";
import { useOpsOverview } from "./opsSource";
import { useFaceProjects } from "./useFaceData";

const SHOWN_STATES: ReadonlyArray<EmployeeWorkState> = [
  "idle",
  "working",
  "waiting",
  "failed",
  "finished",
];

function useStateLabels(): Record<EmployeeWorkState, string> {
  const gt = useGT();
  return {
    idle: gt("Free", { $context: "an employee has nothing to do" }),
    working: gt("Working", { $context: "an employee is doing the work" }),
    waiting: gt("Waiting for someone", { $context: "an employee waits on a person" }),
    failed: gt("Stuck", { $context: "an employee's work failed" }),
    finished: gt("Just finished", { $context: "an employee finished a piece of work" }),
  };
}

/**
 * Who does the work. An environment names at most one employee, so that is the team; an
 * operator also sees the people paired with the machine and how many projects each has.
 */
export function FaceTeamPage() {
  const operator = useCustomerFace().face === "operator";
  const ops = useOpsOverview();
  if (operator && (ops.status === "ready" || ops.status === "lost") && ops.overview !== null) {
    return (
      <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-12 pt-10 pb-8">
        <h1 className="text-2xl font-bold">
          <T>Team</T>
        </h1>
        <OpsTeamPage base={ops.base} overview={ops.overview} />
      </main>
    );
  }
  return <LocalTeamPage />;
}

function LocalTeamPage() {
  const gt = useGT();
  const operator = useCustomerFace().face === "operator";
  const employee = usePrimaryEmployee();
  const labels = useStateLabels();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const identity = useEnvironmentIdentities(
    primaryEnvironmentId === null ? [] : [primaryEnvironmentId],
  )[0];
  const { projects, nowMs } = useFaceProjects();
  const state = busiestWorkState(
    projects.map((project) =>
      employeeWorkState(project.status, project.latestThread.latestRun, nowMs),
    ),
  );
  const projectsByOwner = new Map<string, number>();
  for (const person of identity?.people ?? []) projectsByOwner.set(person, 0);
  for (const project of projects) {
    const owner = project.latestThread.owner;
    if (owner !== null) projectsByOwner.set(owner, (projectsByOwner.get(owner) ?? 0) + 1);
  }
  const name = employee?.name ?? gt("Assistant", { $context: "an AI assistant with no name" });

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-12 pt-10 pb-8">
      <h1 className="text-2xl font-bold">{operator ? <T>Team</T> : <T>My team</T>}</h1>
      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-(--customer-shadow-line)">
        <div className="flex items-center gap-4">
          <Companion
            employee={employee}
            animation={companionAnimation(state)}
            size={72}
            seed={employee?.id ?? "assistant"}
            label={gt("{name}: {state}", { name, state: labels[state] })}
          />
          <div className="min-w-0">
            <div className="text-lg font-semibold">
              {name}
              {employee?.alias ? (
                <span className="font-normal text-muted-foreground"> · {employee.alias}</span>
              ) : null}
            </div>
            {employee?.title ? <div className="text-muted-foreground">{employee.title}</div> : null}
            {employee?.about ? <div>{employee.about}</div> : null}
            <div className="text-(length:--customer-note) text-info">{labels[state]}</div>
          </div>
        </div>
        {employee?.companion !== undefined ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
            {SHOWN_STATES.map((shown) => (
              <div key={shown} className="flex flex-col items-center gap-1.5">
                <div className="flex h-24 w-full items-end justify-center rounded-xl bg-(--customer-canvas)">
                  <Companion
                    employee={employee}
                    animation={companionAnimation(shown)}
                    size={72}
                    seed={employee.id}
                  />
                </div>
                <span className="text-(length:--customer-note) text-muted-foreground">
                  {labels[shown]}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {employee === undefined ? (
          <div className="text-(length:--customer-note) text-muted-foreground">
            <T>This machine does not name its assistant yet.</T>
          </div>
        ) : null}
      </section>
      {operator && projectsByOwner.size > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">
            <T>People</T>
          </h2>
          <div className="flex flex-col rounded-2xl bg-card px-4 py-1 shadow-(--customer-shadow-line)">
            {[...projectsByOwner]
              .toSorted(([left], [right]) => left.localeCompare(right))
              .map(([person, count]) => (
                <div
                  key={person}
                  className="flex items-center gap-2.5 border-b border-muted py-2.5 last:border-b-0"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-border text-xs font-semibold">
                    {[...person][0]?.toUpperCase()}
                  </span>
                  <span className="flex-1 font-medium">{person}</span>
                  <span className="text-(length:--customer-note) text-muted-foreground">
                    {gt(
                      "{count, plural, =0 {No projects} =1 {1 project} other {{count} projects}}",
                      {
                        count,
                      },
                    )}
                  </span>
                </div>
              ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
