import { Link } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import { useState, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { formatElapsedDurationLabel } from "../timestampFormat";
import { Companion } from "./Companion";
import { StartBox } from "./CustomerHome";
import {
  inFlight,
  lastFinished,
  needsYou,
  opsEmployeeAnimation,
  opsEmployeeBusy,
  projectStatus,
  projectsByStatus,
  type NeedsYou,
  type OpsEmployee,
  type OpsOverview,
  type OpsProject,
  type OpsProjectStatus,
} from "./opsOverview.logic";
import { connectOps, disconnectOps, opsAddress, type OpsState } from "./opsSource";
import { useFaceProjects, useNowMs } from "./useFaceData";

const HOME_NEEDS_COUNT = 5;
const HOME_PROJECT_COUNT = 8;

function Panel(props: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl bg-card shadow-(--customer-shadow-line)", props.className)}>
      {props.children}
    </div>
  );
}

function SectionTitle(props: { title: ReactNode; note?: ReactNode; more?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-base font-semibold">{props.title}</h2>
      {props.note ? (
        <span className="text-(length:--customer-note) text-muted-foreground">{props.note}</span>
      ) : null}
      <span className="flex-1" />
      {props.more}
    </div>
  );
}

/** Asks for a console link once and spends it for a token the app keeps. */
export function OpsConnectCard(props: { lost?: boolean }) {
  const gt = useGT();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const connect = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await connectOps(link);
      setLink("");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div>
        <div className="text-base font-semibold">
          {props.lost ? (
            <T>The operations data stopped answering</T>
          ) : (
            <T>Connect your team's operations</T>
          )}
        </div>
        <div className="text-(length:--customer-note) text-muted-foreground">
          {props.lost ? (
            <T>The sign-in may have run out. Paste a new console link from your service.</T>
          ) : (
            <T>
              Paste the console link your SuperSteward service gave you. Requests, customers, checks
              and launches then show here.
            </T>
          )}
        </div>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void connect();
        }}
      >
        <input
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://…/ops/enter/…"
          aria-label={gt("Console link")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5"
        />
        <button
          type="submit"
          disabled={busy || link.trim() === ""}
          className="rounded-lg bg-primary px-3.5 py-1.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          <T context="button: connect to the operations data">Connect</T>
        </button>
      </form>
      {failed ? (
        <div className="text-(length:--customer-note) text-error-foreground">
          <T>
            That link did not work. Links open once and run out after a while; ask for a new one.
          </T>
        </div>
      ) : null}
    </Panel>
  );
}

function OpsCompanion(props: { base: string; employee: OpsEmployee; size: number }) {
  const sheetUrl = opsAddress(props.base, props.employee.companion);
  return (
    <Companion
      employee={{
        id: props.employee.id,
        name: props.employee.name,
        ...(sheetUrl === undefined ? {} : { companion: { sheetUrl } }),
      }}
      animation={opsEmployeeAnimation(props.employee.state)}
      size={props.size}
      seed={props.employee.id}
      label={props.employee.name}
    />
  );
}

function useGreeting(): string {
  const gt = useGT();
  const hour = new Date(useNowMs()).getHours();
  if (hour < 5 || hour >= 18) return gt("Good evening.");
  if (hour < 12) return gt("Good morning.");
  return gt("Good afternoon.");
}

/** A project of the service as the t3 project of the same name, when one is open here. */
function useLocalProject(name: string) {
  const { projects } = useFaceProjects();
  return projects.find((project) => project.title === name) ?? null;
}

function NeedsYouRow(props: { item: NeedsYou }) {
  const gt = useGT();
  const messages = useMessages();
  const { item } = props;
  const local = useLocalProject(item.project);
  const nowMs = useNowMs();
  const stuck = item.kind === "stuck";
  const since =
    item.kind === "stuck"
      ? item.since === null
        ? null
        : formatElapsedDurationLabel(item.since, nowMs, messages)
      : gt("{minutes} min", { minutes: item.minutes });
  return (
    <div className="flex items-start gap-3.5 px-5 py-4">
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-lg px-2 text-xs/5 font-semibold",
          stuck ? "bg-error/10 text-error-foreground" : "bg-warning/15 text-warning-foreground",
        )}
      >
        {stuck
          ? gt("Stuck", { $context: "badge: work failed and needs a person" })
          : gt("Customer waiting")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">
          {item.project}
          {item.title ? `：${item.title}` : ""}
        </div>
        <div className="truncate text-(length:--customer-note) text-muted-foreground">
          {item.kind === "stuck"
            ? (item.reason ?? gt("It did not go through"))
            : item.customer
              ? gt("{customer} is waiting, number {place} in line", {
                  customer: item.customer,
                  place: item.place,
                })
              : gt("Number {place} in line", { place: item.place })}
        </div>
      </div>
      {since ? (
        <span className="shrink-0 text-(length:--customer-note) text-muted-foreground">
          {since}
        </span>
      ) : null}
      {local !== null ? (
        <Link
          to="/c/$environmentId/$projectId"
          params={local.projectRef}
          search={{ view: "backstage" }}
          className="shrink-0 rounded-lg bg-primary px-3 py-1 text-(length:--customer-note) font-medium text-primary-foreground"
        >
          <T context="button: open the project behind the scenes">Take a look</T>
        </Link>
      ) : null}
    </div>
  );
}

export function NeedsYouList(props: { items: ReadonlyArray<NeedsYou> }) {
  if (props.items.length === 0) {
    return (
      <Panel className="px-5 py-6 text-center text-muted-foreground">
        <T>Nothing needs you. Everything under way is moving.</T>
      </Panel>
    );
  }
  return (
    <Panel className="flex flex-col divide-y divide-border">
      {props.items.map((item) => (
        <NeedsYouRow key={item.key} item={item} />
      ))}
    </Panel>
  );
}

function useStatusLabel(): Record<OpsProjectStatus, string> {
  const gt = useGT();
  return {
    stuck: gt("Stuck, needs you"),
    queued: gt("Waiting its turn"),
    working: gt("Being made"),
    checking: gt("Being checked"),
    live: gt("Live"),
    quiet: gt("Quiet"),
  };
}

const STATUS_DOT: Record<OpsProjectStatus, string> = {
  stuck: "bg-error",
  queued: "bg-warning",
  working: "bg-info",
  checking: "bg-info",
  live: "bg-success",
  quiet: "bg-border",
};

function OpsProjectCard(props: { overview: OpsOverview; project: OpsProject }) {
  const gt = useGT();
  const labels = useStatusLabel();
  const { project } = props;
  const { status, task } = projectStatus(props.overview, project);
  const recent = lastFinished(props.overview, project);
  const address = project.environment?.serving ? project.environment.address : null;
  return (
    <Panel className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
        <span className="min-w-0 flex-1 truncate font-semibold">{project.name}</span>
      </div>
      <div className="text-(length:--customer-note) text-muted-foreground">
        {project.customers.length > 0 ? project.customers.join("、") : <T>No customer yet</T>}
      </div>
      <div className="text-(length:--customer-note)">
        <span className="font-medium">{labels[status]}</span>
        {task?.summary ? <span className="text-muted-foreground"> · {task.summary}</span> : null}
      </div>
      {task === null && recent !== null ? (
        <div className="truncate text-(length:--customer-note) text-muted-foreground">
          {gt("Last: {title}, {summary}", { title: recent.title, summary: recent.summary ?? "" })}
        </div>
      ) : null}
      {address ? (
        <a
          href={address}
          target="_blank"
          rel="noreferrer"
          className="truncate text-(length:--customer-note) text-info hover:underline"
        >
          {address}
        </a>
      ) : null}
    </Panel>
  );
}

export function OpsProjectGrid(props: { overview: OpsOverview; limit?: number }) {
  const shown = projectsByStatus(props.overview).slice(0, props.limit);
  if (shown.length === 0) {
    return (
      <Panel className="px-5 py-6 text-center text-muted-foreground">
        <T>No projects yet.</T>
      </Panel>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
      {shown.map((project) => (
        <OpsProjectCard key={project.name} overview={props.overview} project={project} />
      ))}
    </div>
  );
}

function useRoleLabel(): (role: string) => string {
  const gt = useGT();
  return (role) =>
    role === "reviewer"
      ? gt("Checks the work")
      : role === "desk"
        ? gt("Front desk")
        : gt("Engineer", { $context: "an employee who writes the software" });
}

function TeamRow(props: { base: string; employee: OpsEmployee }) {
  const gt = useGT();
  const roleLabel = useRoleLabel();
  const { employee } = props;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <OpsCompanion base={props.base} employee={employee} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold">{employee.name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel(employee.role)}</span>
        </div>
        <div className="truncate text-(length:--customer-note) text-muted-foreground">
          {employee.doing ?? gt("Free")}
        </div>
      </div>
    </div>
  );
}

function OpsTeamPanel(props: { base: string; overview: OpsOverview }) {
  return (
    <Panel className="flex flex-col py-1.5">
      {props.overview.employees.map((employee) => (
        <TeamRow key={employee.id} base={props.base} employee={employee} />
      ))}
    </Panel>
  );
}

/** The team page from the service: everyone, their companion acting out what they do. */
export function OpsTeamPage(props: { base: string; overview: OpsOverview }) {
  const roleLabel = useRoleLabel();
  const gt = useGT();
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
      {props.overview.employees.map((employee) => (
        <Panel
          key={employee.id}
          className="flex flex-col items-center gap-2 px-5 pt-5 pb-4 text-center"
        >
          <div className="flex h-28 items-end">
            <OpsCompanion base={props.base} employee={employee} size={96} />
          </div>
          <div>
            <div className="text-base font-semibold">{employee.name}</div>
            <div className="text-xs text-muted-foreground">{roleLabel(employee.role)}</div>
          </div>
          <div className="text-(length:--customer-note)">{employee.doing ?? gt("Free")}</div>
          {employee.projects.length > 0 ? (
            <div className="text-xs text-muted-foreground">{employee.projects.join("、")}</div>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

/** The operator's first screen, from the service: how things stand, what needs them, the team and projects. */
export function OpsHome(props: { state: Extract<OpsState, { status: "ready" | "lost" }> }) {
  const gt = useGT();
  const greeting = useGreeting();
  const [prompt, setPrompt] = useState("");
  const { overview } = props.state;
  if (overview === null) return <OpsConnectCard lost />;
  const items = needsYou(overview);
  const moving = Math.max(0, inFlight(overview) - items.length);
  const busy = overview.employees.filter((employee) => opsEmployeeBusy(employee.state)).length;
  const free = overview.employees.length - busy;
  const faces = overview.employees.slice(0, 3);
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-12 pt-10 pb-8">
      {props.state.status === "lost" ? <OpsConnectCard lost /> : null}
      <div className="flex items-center gap-4">
        <div className="flex items-end -space-x-2">
          {faces.map((employee) => (
            <OpsCompanion key={employee.id} base={props.state.base} employee={employee} size={52} />
          ))}
        </div>
        <div>
          <h1 className="text-3xl/9.5 font-bold tracking-tight">
            {greeting}{" "}
            {items.length > 0
              ? gt(
                  "{needYou, plural, =1 {1 thing needs you} other {{needYou} things need you}}, {moving} more moving along.",
                  { needYou: items.length, moving },
                )
              : moving > 0
                ? gt("Nothing needs you; {moving} moving along.", { moving })
                : gt("Nothing needs you, and nothing is under way.")}
          </h1>
          <div className="text-muted-foreground">
            {gt("{merged} launched today. {busy} of the team busy, {free} free.", {
              merged: overview.counters.merged_today,
              busy,
              free,
            })}
          </div>
        </div>
      </div>
      <StartBox
        prompt={prompt}
        onPrompt={setPrompt}
        placeholder={gt("Ask the team, or start a project for a customer.")}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5">
        <section className="flex min-w-0 flex-col gap-3">
          <SectionTitle
            title={<T>Needs you</T>}
            note={<T>Most urgent first</T>}
            more={
              items.length > HOME_NEEDS_COUNT ? (
                <Link
                  to="/c/attention"
                  className="text-(length:--customer-note) text-muted-foreground"
                >
                  {gt("All {count} ›", { count: items.length })}
                </Link>
              ) : null
            }
          />
          <NeedsYouList items={items.slice(0, HOME_NEEDS_COUNT)} />
        </section>
        <section className="flex flex-col gap-3">
          <SectionTitle
            title={<T>Team</T>}
            more={
              <Link to="/c/team" className="text-(length:--customer-note) text-muted-foreground">
                {gt("All ›")}
              </Link>
            }
          />
          <OpsTeamPanel base={props.state.base} overview={overview} />
        </section>
      </div>
      <section className="flex flex-col gap-3">
        <SectionTitle
          title={<T>All projects</T>}
          more={
            overview.projects.length > HOME_PROJECT_COUNT ? (
              <Link
                to="/c/projects"
                className="text-(length:--customer-note) text-muted-foreground"
              >
                {gt("All {count} ›", { count: overview.projects.length })}
              </Link>
            ) : null
          }
        />
        <OpsProjectGrid overview={overview} limit={HOME_PROJECT_COUNT} />
      </section>
      <button
        type="button"
        onClick={disconnectOps}
        className="self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <T>Disconnect the operations data</T>
      </button>
    </main>
  );
}
