import {
  EnvironmentId,
  NodeId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2Subagent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";
import { makeThreadProjectionFixture } from "../test-fixtures";
import type { ChatMessage } from "../types";
import { deriveProgressSteps, toCustomerRows } from "./customerTimeline.logic";

const at = (iso: string) => DateTime.makeUnsafe(iso);

function row(kind: MessagesTimelineRow["kind"], extra: object = {}): MessagesTimelineRow {
  return { kind, id: kind, createdAt: "2026-06-20T00:00:00.000Z", ...extra } as never;
}

describe("toCustomerRows", () => {
  it("keeps the conversation and drops the developer rows", () => {
    const said = (id: string, message: Partial<ChatMessage>) =>
      row("message", { id, message: { role: "user", text: id, streaming: false, ...message } });
    expect(
      toCustomerRows([
        said("ask", { text: "Make a sign-up page" }),
        row("work"),
        row("work-toggle"),
        said("answer", { role: "assistant", text: "On it." }),
        said("note", { role: "system", text: "internal" }),
        said("empty", { role: "assistant", text: "" }),
        row("event"),
        row("proposed-plan"),
        row("context-compaction"),
        said("later", { text: "Add a phone field", inputIntent: "queued_turn" }),
      ]),
    ).toEqual([
      { kind: "user", id: "ask", text: "Make a sign-up page", queued: false },
      { kind: "assistant", id: "answer", text: "On it.", streaming: false, itemId: undefined },
      { kind: "user", id: "later", text: "Add a phone field", queued: true },
    ]);
  });

  it("keeps a finished stretch of work as its one-line summary", () => {
    expect(toCustomerRows([row("turn-fold", { label: "Worked for 2m 10s" })])).toEqual([
      { kind: "summary", id: "turn-fold", label: "Worked for 2m 10s" },
    ]);
  });

  it("shows one working sign, last, however many live rows there are", () => {
    const result = toCustomerRows([
      row("thinking"),
      row("work-live"),
      row("message", {
        message: { role: "assistant", text: "", streaming: true },
        projectedItem: { item: { id: "item-1" } },
      }),
      row("working"),
    ]);
    expect(result).toEqual([
      { kind: "assistant", id: "message", text: "", streaming: true, itemId: "item-1" },
      { kind: "working", id: "working" },
    ]);
  });
});

function subagent(
  id: string,
  overrides: Partial<OrchestrationV2Subagent> = {},
): OrchestrationV2Subagent {
  return {
    id: NodeId.make(id),
    threadId: ThreadId.make("thread-test"),
    runId: RunId.make("run-1"),
    parentNodeId: NodeId.make("node-1"),
    origin: "app_owned",
    createdBy: "agent",
    driver: ProviderDriverKind.make("codex"),
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerThreadId: null,
    childThreadId: null,
    nativeTaskRef: null,
    prompt: "Do the thing",
    title: id,
    model: null,
    status: "running",
    result: null,
    startedAt: at("2026-06-20T00:00:00.000Z"),
    completedAt: null,
    updatedAt: at("2026-06-20T00:00:01.000Z"),
    ...overrides,
  };
}

describe("deriveProgressSteps", () => {
  it("has no steps for a turn that delegated nothing", () => {
    expect(deriveProgressSteps(makeThreadProjectionFixture())).toEqual([]);
  });

  it("turns the turn's tasks into steps in start order", () => {
    const steps = deriveProgressSteps({
      runs: [],
      subagents: [
        subagent("Check the form", {
          status: "pending",
          startedAt: at("2026-06-20T00:03:00.000Z"),
        }),
        subagent("Build the page", {
          status: "completed",
          startedAt: at("2026-06-20T00:01:00.000Z"),
        }),
        subagent("Wire the form", {
          status: "running",
          progress: "Saving entries",
          startedAt: at("2026-06-20T00:02:00.000Z"),
          remoteChild: {
            environmentId: EnvironmentId.make("env-2"),
            threadId: ThreadId.make("thread-remote"),
            label: "Build machine",
          },
        }),
        subagent("Old idea", { status: "failed", startedAt: at("2026-06-20T00:04:00.000Z") }),
        subagent("Dropped", { status: "cancelled", startedAt: at("2026-06-20T00:05:00.000Z") }),
      ],
    });
    expect(steps).toEqual([
      { id: "Build the page", title: "Build the page", detail: null, worker: null, state: "done" },
      {
        id: "Wire the form",
        title: "Wire the form",
        detail: "Saving entries",
        worker: "Build machine",
        state: "active",
      },
      {
        id: "Check the form",
        title: "Check the form",
        detail: null,
        worker: null,
        state: "pending",
      },
      { id: "Old idea", title: "Old idea", detail: null, worker: null, state: "failed" },
      { id: "Dropped", title: "Dropped", detail: null, worker: null, state: "stopped" },
    ]);
  });

  it("names an untitled task by its prompt", () => {
    const [step] = deriveProgressSteps({
      runs: [],
      subagents: [subagent("a", { title: null, prompt: "Draw the logo" })],
    });
    expect(step?.title).toBe("Draw the logo");
  });
});
