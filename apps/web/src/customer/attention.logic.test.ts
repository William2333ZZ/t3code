import { EnvironmentId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture, type ThreadFixtureOverrides } from "../test-fixtures";
import type { Project, Thread } from "../types";
import {
  deriveAttention,
  operatorHeadline,
  summarizeOperatorDesk,
  type AttentionItem,
} from "./attention.logic";
import { deriveCustomerProjects } from "./customerProjects.logic";

const environmentId = EnvironmentId.make("env-1");
const providerInstanceId = ProviderInstanceId.make("codex");
const now = Date.parse("2026-03-09T12:00:00.000Z");

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
    updatedAt: "2026-03-09T11:00:00.000Z",
    ...shell,
  };
}

function runtime(status: "running" | "failed", extra: object = {}) {
  return {
    status,
    activeRunId: status === "running" ? RunId.make("run-1") : null,
    providerInstanceId,
    providerName: null,
    lastError: status === "failed" ? "Tests failed\nsecond line" : null,
    updatedAt: "2026-03-09T11:30:00.000Z",
    ...extra,
  } as const;
}

const kinds = (items: ReadonlyArray<AttentionItem>) =>
  items.map((item) => [item.kind, item.thread.id, item.since]);

describe("deriveAttention", () => {
  it("finds requests, failures and long work, most urgent first", () => {
    const items = deriveAttention(
      [project("a"), project("b")],
      [
        thread("quiet", "a"),
        thread(
          "asks",
          "a",
          {},
          {
            hasPendingUserInput: true,
            pendingUserInputAt: "2026-03-09T11:40:00.000Z",
          },
        ),
        thread("approval", "b", {}, { hasPendingApprovals: true }),
        thread("broke", "b", {}, { runtime: runtime("failed") }),
        thread(
          "limited",
          "a",
          {},
          {
            runtime: runtime("failed", { lastErrorClass: "usage_limit" }),
          },
        ),
        thread(
          "long",
          "b",
          {},
          {
            runtime: runtime("running", { activityStartedAt: "2026-03-09T11:00:00.000Z" }),
          },
        ),
        thread(
          "short",
          "b",
          {},
          {
            runtime: runtime("running", { activityStartedAt: "2026-03-09T11:50:00.000Z" }),
          },
        ),
      ],
      now,
    );
    expect(kinds(items)).toEqual([
      ["failed", "broke", "2026-03-09T11:30:00.000Z"],
      ["approval", "approval", null],
      ["input", "asks", "2026-03-09T11:40:00.000Z"],
      ["limited", "limited", "2026-03-09T11:30:00.000Z"],
      ["long-work", "long", "2026-03-09T11:00:00.000Z"],
    ]);
    expect(items[0]!.projectTitle).toBe("b");
  });

  it("orders the same kind oldest first", () => {
    const asks = (id: string, at: string) =>
      thread(id, "a", {}, { hasPendingUserInput: true, pendingUserInputAt: at });
    const items = deriveAttention(
      [project("a")],
      [asks("later", "2026-03-09T11:50:00.000Z"), asks("earlier", "2026-03-09T11:10:00.000Z")],
      now,
    );
    expect(items.map((item) => item.thread.id)).toEqual(["earlier", "later"]);
  });

  it("skips archived, snoozed, settled, unlisted and project-less threads", () => {
    const failed = { runtime: runtime("failed") };
    const root = ThreadId.make("main");
    const items = deriveAttention(
      [project("a"), project("gone", { archivedAt: "2026-03-09T09:00:00.000Z" })],
      [
        thread("archived", "a", { archivedAt: "2026-03-09T11:00:00.000Z" }, failed),
        thread("snoozed", "a", {}, { ...failed, snoozedUntil: "2026-03-09T13:00:00.000Z" }),
        thread("woke", "a", {}, { ...failed, snoozedUntil: "2026-03-09T11:00:00.000Z" }),
        thread("settled", "a", {}, { ...failed, settledOverride: "settled" }),
        thread(
          "subagent",
          "a",
          {
            lineage: {
              rootThreadId: root,
              parentThreadId: root,
              relationshipToParent: "subagent",
            },
          },
          failed,
        ),
        thread("elsewhere", "gone", {}, failed),
        thread("unknown", "missing", {}, failed),
      ],
      now,
    );
    expect(items.map((item) => item.thread.id)).toEqual(["woke"]);
  });
});

describe("operatorHeadline", () => {
  const projects = deriveCustomerProjects(
    [project("a"), project("b"), project("c")],
    [
      thread(
        "a1",
        "a",
        {},
        { runtime: runtime("running", { activityStartedAt: "2026-03-09T11:55:00.000Z" }) },
      ),
      thread("b1", "b", {}, { runtime: runtime("failed") }),
      thread("c1", "c"),
    ],
  );

  it("counts what needs the operator and what moves on its own", () => {
    const attention = deriveAttention(
      [project("a"), project("b"), project("c")],
      projects.map((entry) => entry.latestThread),
      now,
    );
    const summary = summarizeOperatorDesk(projects, attention);
    expect(summary).toEqual({ needYou: 1, moving: 1, total: 3 });
    expect(operatorHeadline(summary, 9)).toBe(
      "Good morning. 1 thing needs you; 1 other project is moving along.",
    );
  });

  it.each([
    [
      { needYou: 0, moving: 0, total: 0 },
      20,
      "Good evening. Nothing needs you, and nothing is running.",
    ],
    [
      { needYou: 0, moving: 2, total: 2 },
      14,
      "Good afternoon. Nothing needs you. 2 projects are moving along.",
    ],
    [{ needYou: 3, moving: 0, total: 3 }, 9, "Good morning. 3 things need you."],
  ] as const)("says %j at %i o'clock", (summary, hour, text) => {
    expect(operatorHeadline(summary, hour)).toBe(text);
  });
});
