import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { isListedThreadLineage, type ScopedProjectRef } from "@t3tools/contracts";
import { msg } from "gt-react";

import { resolveSidebarThreadStatus } from "../components/Sidebar.logic";
import { m, type MessageResolver } from "../i18n/messages";
import type { CustomerProject } from "./customerProjects.logic";

/** Why an operator should look at a thread, most urgent first. */
export type AttentionKind = "failed" | "approval" | "input" | "limited" | "long-work";

export interface AttentionItem {
  readonly kind: AttentionKind;
  readonly projectRef: ScopedProjectRef;
  readonly projectTitle: string;
  readonly thread: EnvironmentThreadShell;
  /** When the thing it waits on began; null when the app does not know. */
  readonly since: string | null;
}

const KIND_ORDER: ReadonlyArray<AttentionKind> = [
  "failed",
  "approval",
  "input",
  "limited",
  "long-work",
];

/** Work running this long without anything else to show for it is worth a look. */
const LONG_WORK_MS = 30 * 60_000;

function workStartedAt(thread: EnvironmentThreadShell): string | null {
  return (
    thread.runtime?.activityStartedAt ??
    thread.latestRun?.startedAt ??
    thread.latestRun?.requestedAt ??
    null
  );
}

function attentionOf(
  thread: EnvironmentThreadShell,
  nowMs: number,
): Pick<AttentionItem, "kind" | "since"> | null {
  switch (resolveSidebarThreadStatus(thread)) {
    case "approval":
      return { kind: "approval", since: null };
    case "input":
      return { kind: "input", since: thread.pendingUserInputAt ?? null };
    case "failed":
    case "limited": {
      // Someone marking a failed thread settled has dealt with it.
      if (thread.settledOverride === "settled") return null;
      const since = thread.latestRun?.completedAt ?? thread.runtime?.updatedAt ?? null;
      return {
        kind: thread.runtime?.lastErrorClass === "usage_limit" ? "limited" : "failed",
        since,
      };
    }
    case "preparing":
    case "working": {
      const since = workStartedAt(thread);
      if (since === null || nowMs - Date.parse(since) < LONG_WORK_MS) return null;
      return { kind: "long-work", since };
    }
    default:
      return null;
  }
}

/**
 * What needs an operator across every thread this session can see: requests the agent is
 * blocked on, failures, and work that has run for a long time. Snoozed threads wait their turn.
 */
export function deriveAttention(
  projects: ReadonlyArray<EnvironmentProject>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
  nowMs: number,
): ReadonlyArray<AttentionItem> {
  const projectByKey = new Map(
    projects
      .filter((project) => project.archivedAt == null)
      .map((project) => [`${project.environmentId}\0${project.id}`, project] as const),
  );
  const items: AttentionItem[] = [];
  for (const thread of threads) {
    if (thread.archivedAt !== null || !isListedThreadLineage(thread.lineage)) continue;
    if (thread.snoozedUntil !== null && Date.parse(thread.snoozedUntil) > nowMs) continue;
    const project = projectByKey.get(`${thread.environmentId}\0${thread.projectId}`);
    if (project === undefined) continue;
    const attention = attentionOf(thread, nowMs);
    if (attention === null) continue;
    items.push({
      ...attention,
      projectRef: scopeProjectRef(project.environmentId, project.id),
      projectTitle: project.title,
      thread,
    });
  }
  return items.toSorted(
    (left, right) =>
      KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) ||
      (left.since ?? "￿").localeCompare(right.since ?? "￿"),
  );
}

export interface OperatorDeskSummary {
  readonly needYou: number;
  /** Projects moving along on their own: working, and nothing about them needs anyone. */
  readonly moving: number;
  readonly total: number;
}

export function summarizeOperatorDesk(
  projects: ReadonlyArray<CustomerProject>,
  attention: ReadonlyArray<AttentionItem>,
): OperatorDeskSummary {
  const flagged = new Set(
    attention.map((item) => `${item.projectRef.environmentId}\0${item.projectRef.projectId}`),
  );
  return {
    needYou: attention.length,
    moving: projects.filter(
      (project) =>
        project.status === "working" &&
        !flagged.has(`${project.projectRef.environmentId}\0${project.projectRef.projectId}`),
    ).length,
    total: projects.length,
  };
}

/** The one sentence at the top of the operator's home. */
export function operatorHeadline(
  summary: OperatorDeskSummary,
  hour: number,
  resolve: MessageResolver = m,
): string {
  const greeting =
    hour < 12
      ? resolve(msg("Good morning."))
      : hour < 18
        ? resolve(msg("Good afternoon."))
        : resolve(msg("Good evening."));
  const { needYou, moving } = summary;
  const sentence =
    needYou === 0
      ? moving === 0
        ? resolve(msg("Nothing needs you, and nothing is running."))
        : resolve(
            msg(
              "Nothing needs you. {moving, plural, =1 {1 project is} other {{moving} projects are}} moving along.",
              { moving },
            ),
          )
      : moving === 0
        ? resolve(
            msg("{needYou, plural, =1 {1 thing needs you.} other {{needYou} things need you.}}", {
              needYou,
            }),
          )
        : resolve(
            msg(
              "{needYou, plural, =1 {1 thing needs you} other {{needYou} things need you}}; {moving, plural, =1 {1 other project is} other {{moving} other projects are}} moving along.",
              { needYou, moving },
            ),
          );
  // Chinese and Japanese join two sentences without a space; the translation decides.
  return resolve(msg("{greeting} {sentence}", { greeting, sentence }));
}
