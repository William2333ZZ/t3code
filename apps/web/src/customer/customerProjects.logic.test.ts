import { EnvironmentId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture, type ThreadFixtureOverrides } from "../test-fixtures";
import type { Project, Thread } from "../types";
import { customerStatusLine, deriveCustomerProjects } from "./customerProjects.logic";

const environmentId = EnvironmentId.make("env-1");
const providerInstanceId = ProviderInstanceId.make("codex");

function project(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id: ProjectId.make(id),
    environmentId,
    title: id,
    workspaceRoot: `/work/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-03-09T10:00:00.000Z",
    updatedAt: "2026-03-09T10:00:00.000Z",
    scripts: [],
    ...overrides,
  };
}

function thread(
  id: string,
  projectId: string,
  updatedAt: string,
  overrides: ThreadFixtureOverrides = {},
  shell: Partial<Thread> = {},
): Thread {
  return {
    ...makeThreadFixture({
      id: ThreadId.make(id),
      environmentId,
      projectId: ProjectId.make(projectId),
      ...overrides,
    }),
    updatedAt,
    ...shell,
  };
}

const running = {
  status: "running",
  activeRunId: RunId.make("run-1"),
  providerInstanceId,
  providerName: null,
  lastError: null,
  updatedAt: "2026-03-09T10:00:00.000Z",
} as const;

describe("deriveCustomerProjects", () => {
  it("takes each project's latest listed thread, newest project first", () => {
    const result = deriveCustomerProjects(
      [project("a"), project("b")],
      [
        thread("a-old", "a", "2026-03-09T10:00:00.000Z"),
        thread("a-new", "a", "2026-03-09T12:00:00.000Z"),
        thread("b-only", "b", "2026-03-09T13:00:00.000Z"),
      ],
    );
    expect(result.map((entry) => [entry.title, entry.latestThread.id, entry.updatedAt])).toEqual([
      ["b", "b-only", "2026-03-09T13:00:00.000Z"],
      ["a", "a-new", "2026-03-09T12:00:00.000Z"],
    ]);
  });

  it("leaves out archived threads, subagents, side chats and workflow steps", () => {
    const root = ThreadId.make("main");
    const child = (relationshipToParent: "subagent" | null, extra: object = {}) => ({
      lineage: { rootThreadId: root, parentThreadId: root, relationshipToParent, ...extra },
    });
    const result = deriveCustomerProjects(
      [project("a")],
      [
        thread("main", "a", "2026-03-09T10:00:00.000Z"),
        thread("archived", "a", "2026-03-09T14:00:00.000Z", {
          archivedAt: "2026-03-09T14:30:00.000Z",
        }),
        thread("subagent", "a", "2026-03-09T15:00:00.000Z", child("subagent")),
        thread("side", "a", "2026-03-09T16:00:00.000Z", child(null, { sideChat: true })),
        thread("step", "a", "2026-03-09T17:00:00.000Z", child(null, { workflowStep: true })),
      ],
    );
    expect(result.map((entry) => entry.latestThread.id)).toEqual(["main"]);
  });

  it("leaves out projects with no thread this session can see, and archived projects", () => {
    const result = deriveCustomerProjects(
      [
        project("mine"),
        project("someone-elses"),
        project("archived", { archivedAt: "2026-03-09T11:00:00.000Z" }),
      ],
      [
        thread("t1", "mine", "2026-03-09T10:00:00.000Z"),
        thread("t2", "archived", "2026-03-09T10:00:00.000Z"),
        // Same project id on another environment is another project.
        {
          ...thread("t3", "someone-elses", "2026-03-09T10:00:00.000Z"),
          environmentId: EnvironmentId.make("env-2"),
        },
      ],
    );
    expect(result.map((entry) => entry.title)).toEqual(["mine"]);
  });

  it.each([
    { name: "an idle session", overrides: {}, shell: {}, status: "idle" },
    { name: "a running turn", overrides: { runtime: running }, shell: {}, status: "working" },
    {
      name: "a turn waiting on another thread",
      overrides: { runtime: running },
      shell: { blockedOnThreadWait: true },
      status: "working",
    },
    {
      name: "an open question",
      overrides: { runtime: running },
      shell: { hasPendingUserInput: true },
      status: "needs-answer",
    },
    {
      name: "an approval request",
      overrides: { runtime: running },
      shell: { hasPendingApprovals: true },
      status: "blocked",
    },
    {
      name: "a failed turn",
      overrides: { runtime: { ...running, status: "failed", activeRunId: null } },
      shell: {},
      status: "failed",
    },
  ] as const)("reads $name as $status", ({ overrides, shell, status }) => {
    const [entry] = deriveCustomerProjects(
      [project("a")],
      [thread("t", "a", "2026-03-09T10:00:00.000Z", overrides, shell)],
    );
    expect(entry?.status).toBe(status);
  });
});

describe("customerStatusLine", () => {
  const now = Date.parse("2026-03-09T12:00:00.000Z");

  it("says who has the next move, and dates a project nobody is working on", () => {
    const at = { updatedAt: "2026-03-09T10:00:00.000Z" };
    expect(customerStatusLine({ ...at, status: "working" }, now)).toBe("The team is working on it");
    expect(customerStatusLine({ ...at, status: "needs-answer" }, now)).toBe(
      "Waiting for your answer",
    );
    expect(customerStatusLine({ ...at, status: "failed" }, now)).toBe("Something went wrong");
    expect(customerStatusLine({ ...at, status: "idle" }, now)).toBe("Updated 2h ago");
  });
});
