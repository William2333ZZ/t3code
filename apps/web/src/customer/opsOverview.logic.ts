import type { CompanionAnimation } from "./companion.logic";

/** What a SuperSteward service's operators' overview (`/ops/data`) says; only the fields read here. */
export interface OpsOverview {
  readonly generated_at: string;
  readonly counters: {
    readonly working: number;
    readonly employees: number;
    readonly queued: number;
    readonly longest_wait_minutes: number | null;
    readonly merged_today: number;
    readonly bounced_today: number;
    readonly attention: number;
  };
  readonly employees: ReadonlyArray<OpsEmployee>;
  readonly queue: ReadonlyArray<OpsQueued>;
  readonly tasks: ReadonlyArray<OpsTask>;
  readonly projects: ReadonlyArray<OpsProject>;
  readonly attention: ReadonlyArray<OpsAttention>;
}

export type OpsEmployeeState =
  | "making"
  | "fixing"
  | "awaiting"
  | "verifying"
  | "busy"
  | "idle"
  | "paused"
  | "down"
  | "unknown";

export interface OpsEmployee {
  readonly id: string;
  readonly name: string;
  readonly role: "worker" | "reviewer" | "desk" | string;
  readonly companion?: string | null;
  readonly state: OpsEmployeeState;
  readonly doing: string | null;
  readonly projects: ReadonlyArray<string>;
}

export interface OpsQueued {
  readonly id: string;
  readonly title: string;
  readonly project: string;
  readonly customer: string | null;
  readonly waiting_minutes: number | null;
  readonly place: number;
}

export interface OpsTask {
  readonly id: string;
  readonly title: string;
  readonly project: string;
  readonly customer: string | null;
  readonly state: "queued" | "working" | "verifying" | "merged" | "failed";
  readonly summary: string | null;
  readonly worker: string | null;
  readonly live: boolean;
  readonly at: Readonly<Record<string, string>>;
}

export interface OpsProject {
  readonly name: string;
  readonly customers: ReadonlyArray<string>;
  readonly workers: ReadonlyArray<string>;
  readonly counts: Readonly<Record<OpsTask["state"], number>>;
  readonly environment: {
    readonly address: string | null;
    readonly state: string | null;
    readonly serving: boolean;
  } | null;
}

export interface OpsAttention {
  readonly title: string | null;
  readonly project: string;
  readonly reason: string | null;
  readonly since: string | null;
  readonly task: string | null;
}

/** A customer kept waiting this long without anyone on their request is something to look at. */
const CUSTOMER_WAIT_MINUTES = 30;

export type NeedsYou =
  | {
      readonly kind: "stuck";
      readonly key: string;
      readonly project: string;
      readonly title: string | null;
      readonly reason: string | null;
      readonly since: string | null;
    }
  | {
      readonly kind: "customer-waiting";
      readonly key: string;
      readonly project: string;
      readonly title: string;
      readonly customer: string | null;
      readonly minutes: number;
      readonly place: number;
    };

/** What needs a person, stuck work first, then the customers kept waiting longest. */
export function needsYou(overview: OpsOverview): ReadonlyArray<NeedsYou> {
  const stuck = overview.attention.map((item, index): NeedsYou => ({
    kind: "stuck",
    key: `stuck:${item.task ?? `${item.project}:${index}`}`,
    project: item.project,
    title: item.title,
    reason: item.reason,
    since: item.since,
  }));
  const waiting = overview.queue
    .filter((item) => (item.waiting_minutes ?? 0) >= CUSTOMER_WAIT_MINUTES)
    .toSorted((left, right) => (right.waiting_minutes ?? 0) - (left.waiting_minutes ?? 0))
    .map((item): NeedsYou => ({
      kind: "customer-waiting",
      key: `waiting:${item.id}`,
      project: item.project,
      title: item.title,
      customer: item.customer,
      minutes: item.waiting_minutes ?? 0,
      place: item.place,
    }));
  return [...stuck, ...waiting];
}

/** Requests under way: asked for, being made, or being checked. */
export function inFlight(overview: OpsOverview): number {
  return overview.tasks.filter(
    (task) => task.state === "queued" || task.state === "working" || task.state === "verifying",
  ).length;
}

export type OpsProjectStatus = "stuck" | "queued" | "working" | "checking" | "live" | "quiet";

/**
 * A project's state in one word and the request behind it: what is stuck, else what is being
 * checked, made or waiting, else whether it is live.
 */
export function projectStatus(
  overview: OpsOverview,
  project: OpsProject,
): { readonly status: OpsProjectStatus; readonly task: OpsTask | null } {
  const mine = overview.tasks.filter((task) => task.project === project.name);
  const first = (state: OpsTask["state"]) => mine.find((task) => task.state === state) ?? null;
  if (overview.attention.some((item) => item.project === project.name)) {
    return { status: "stuck", task: first("failed") };
  }
  for (const [state, status] of [
    ["verifying", "checking"],
    ["working", "working"],
    ["queued", "queued"],
  ] as const) {
    const task = first(state);
    if (task !== null) return { status, task };
  }
  return { status: project.environment?.serving ? "live" : "quiet", task: null };
}

const STATUS_ORDER: ReadonlyArray<OpsProjectStatus> = [
  "stuck",
  "checking",
  "working",
  "queued",
  "live",
  "quiet",
];

/** Projects with something going on first, in the order a person should look at them. */
export function projectsByStatus(overview: OpsOverview): ReadonlyArray<OpsProject> {
  const rank = (project: OpsProject) =>
    STATUS_ORDER.indexOf(projectStatus(overview, project).status);
  return overview.projects.toSorted((left, right) => rank(left) - rank(right));
}

/** The request of a project that finished last, merged or not. */
export function lastFinished(overview: OpsOverview, project: OpsProject): OpsTask | null {
  const finishedAt = (task: OpsTask) => Date.parse(task.at.merged ?? task.at.failed ?? "") || 0;
  return (
    overview.tasks
      .filter(
        (task) =>
          task.project === project.name && (task.state === "merged" || task.state === "failed"),
      )
      .toSorted((left, right) => finishedAt(right) - finishedAt(left))[0] ?? null
  );
}

const ANIMATION_BY_STATE: Record<OpsEmployeeState, CompanionAnimation> = {
  making: "running",
  fixing: "running",
  busy: "running",
  verifying: "review",
  awaiting: "waiting",
  idle: "idle",
  paused: "idle",
  down: "failed",
  unknown: "idle",
};

export function opsEmployeeAnimation(state: OpsEmployeeState): CompanionAnimation {
  return ANIMATION_BY_STATE[state] ?? "idle";
}

/** Whether an employee is on something now. */
export function opsEmployeeBusy(state: OpsEmployeeState): boolean {
  return (
    state === "making" ||
    state === "fixing" ||
    state === "verifying" ||
    state === "busy" ||
    state === "awaiting"
  );
}

/**
 * The service and the one-time code in a console link, as a manager is sent it:
 * `https://host/ops/enter/<code>`. Only https: the token that comes back is a credential.
 */
export function parseOpsLink(
  link: string,
): { readonly base: string; readonly code: string } | null {
  const text = link.trim();
  if (!URL.canParse(text)) return null;
  const url = new URL(text);
  const match = /^\/ops\/(?:enter|token)\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname);
  if (url.protocol !== "https:" || match === null) return null;
  return { base: url.origin, code: match[1]! };
}
