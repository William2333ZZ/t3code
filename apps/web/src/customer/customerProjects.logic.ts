import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { isListedThreadLineage, type ScopedProjectRef } from "@t3tools/contracts";
import { msg } from "gt-react";

import { resolveSidebarThreadStatus } from "../components/Sidebar.logic";
import { m, type MessageResolver } from "../i18n/messages";
import { formatRelativeTimeLabel } from "../timestampFormat";

export type CustomerProjectStatus = "working" | "needs-answer" | "blocked" | "failed" | "idle";

export interface CustomerProject {
  readonly projectRef: ScopedProjectRef;
  readonly title: string;
  readonly latestThread: EnvironmentThreadShell;
  readonly status: CustomerProjectStatus;
  readonly updatedAt: string;
}

function customerStatus(thread: EnvironmentThreadShell): CustomerProjectStatus {
  switch (resolveSidebarThreadStatus(thread)) {
    case "input":
    case "request":
      return "needs-answer";
    case "approval":
      return "blocked";
    case "preparing":
    case "working":
      return "working";
    case "failed":
    case "limited":
      return "failed";
    case "waiting":
      // A run parked on another thread is still the team's turn; an idle session is not.
      return thread.runtime?.status === "running" ? "working" : "idle";
    case "ready":
      return "idle";
  }
}

/**
 * The projects a customer owns work in, newest first. Project records are not kept apart per
 * person but threads are, so a project counts only when the session can see a thread in it.
 * Its conversation is the latest listed thread: no subagent, side chat or workflow step.
 */
export function deriveCustomerProjects(
  projects: ReadonlyArray<EnvironmentProject>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
): ReadonlyArray<CustomerProject> {
  const latestByProject = new Map<string, EnvironmentThreadShell>();
  for (const thread of threads) {
    if (thread.archivedAt !== null || !isListedThreadLineage(thread.lineage)) continue;
    const key = `${thread.environmentId}\0${thread.projectId}`;
    const current = latestByProject.get(key);
    if (current === undefined || thread.updatedAt > current.updatedAt) {
      latestByProject.set(key, thread);
    }
  }
  return projects
    .flatMap((project): CustomerProject[] => {
      const latestThread = latestByProject.get(`${project.environmentId}\0${project.id}`);
      if (latestThread === undefined || project.archivedAt != null) return [];
      return [
        {
          projectRef: scopeProjectRef(project.environmentId, project.id),
          title: project.title,
          latestThread,
          status: customerStatus(latestThread),
          updatedAt: latestThread.updatedAt,
        },
      ];
    })
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/** One plain line on where a project stands, from its thread's state alone. */
export function customerStatusLine(
  project: Pick<CustomerProject, "status" | "updatedAt">,
  nowMs: number,
  resolve: MessageResolver = m,
): string {
  switch (project.status) {
    case "working":
      return resolve(msg("The team is working on it"));
    case "needs-answer":
      return resolve(msg("Waiting for your answer"));
    case "blocked":
      return resolve(msg("Paused, waiting for a permission"));
    case "failed":
      return resolve(msg("Something went wrong"));
    case "idle":
      return resolve(
        msg("Updated {when}", { when: formatRelativeTimeLabel(project.updatedAt, nowMs, resolve) }),
      );
  }
}
