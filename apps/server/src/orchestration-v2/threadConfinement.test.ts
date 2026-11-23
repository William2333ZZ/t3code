import { expect, it } from "@effect/vitest";
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Stream from "effect/Stream";

import { makeThreadConfinement } from "./threadConfinement.ts";

const thread = (id: string, owner?: string, rootThreadId = id) =>
  ({
    id,
    ...(owner === undefined ? {} : { owner: { person: owner } }),
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId },
  }) as unknown as OrchestrationV2ThreadShell;

const mine = thread("mine", "alice");
const theirs = thread("theirs", "bob");
// An agent's own threads carry no owner; they follow the thread they came from.
const myAgents = thread("my-agents", undefined, "mine");
const theirAgents = thread("their-agents", undefined, "theirs");
const threads = [mine, theirs, thread("nobodys"), myAgents, theirAgents];

const alice = makeThreadConfinement({
  person: "alice",
  getThreadShell: (id) =>
    id === "unreadable"
      ? Effect.fail("database is locked")
      : Effect.succeed(threads.find((entry) => entry.id === id) ?? null),
});

it.effect("lets a person open their own threads and their agents', and no others", () =>
  Effect.gen(function* () {
    expect(yield* Effect.forEach(threads, (entry) => alice.mayOpen(entry.id))).toEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
    // Creating a thread names an id that does not exist yet.
    expect(yield* alice.mayOpen("new")).toBe(true);
    expect(yield* alice.mayOpen("unreadable")).toBe(false);
  }),
);

it.effect("keeps a person's rows, a child with its root even when the root is not listed", () =>
  Effect.gen(function* () {
    expect((yield* alice.rows(threads)).map((entry) => entry.id)).toEqual(["mine", "my-agents"]);
    expect((yield* alice.rows([myAgents, theirAgents])).map((entry) => entry.id)).toEqual([
      "my-agents",
    ]);
  }),
);

it.effect("refuses a request naming someone else's thread and drops such ids from a list", () =>
  Effect.gen(function* () {
    expect(Exit.isFailure(yield* Effect.exit(alice.input({ threadId: "theirs" })))).toBe(true);
    expect(
      Exit.isFailure(
        yield* Effect.exit(alice.input({ threadId: "new", sourceThreadId: "theirs" })),
      ),
    ).toBe(true);
    const own = { threadId: "mine", text: "hi" };
    expect(yield* alice.input(own)).toBe(own);
    expect(yield* alice.input({ threadIds: ["mine", "theirs", "my-agents"] })).toEqual({
      threadIds: ["mine", "my-agents"],
    });
  }),
);

it.effect("filters what comes back: thread lists, id lists and search matches", () =>
  Effect.gen(function* () {
    expect(
      yield* alice.output({
        snapshotSequence: 7,
        threads: [mine, theirs],
        archivedThreads: [theirs],
        threadIds: ["mine", "theirs"],
        matches: [{ threadId: "theirs", text: "secret" }, { threadId: "mine" }],
      }),
    ).toEqual({
      snapshotSequence: 7,
      threads: [mine],
      archivedThreads: [],
      threadIds: ["mine"],
      matches: [{ threadId: "mine" }],
    });
  }),
);

it.effect("turns an update to someone else's thread into a removal", () =>
  Effect.gen(function* () {
    const update = { kind: "thread.updated", sequence: 4, location: "active", thread: mine };
    expect(yield* alice.streamItem(update)).toBe(update);
    // A thread handed on leaves the giver's list the way a deleted one does.
    expect(
      yield* alice.streamItem({
        kind: "thread.updated",
        sequence: 5,
        location: "active",
        thread: theirs,
      }),
    ).toEqual({ kind: "thread.removed", sequence: 5, location: "active", threadId: "theirs" });
    expect(
      yield* alice.streamItem({ kind: "snapshot", snapshot: { threads, archivedThreads: [] } }),
    ).toEqual({ kind: "snapshot", snapshot: { threads: [mine, myAgents], archivedThreads: [] } });
  }),
);

it.effect("confines every handler, whether it answers once or as a stream", () =>
  Effect.gen(function* () {
    const calls: Array<string> = [];
    const handlers = alice.handlers({
      read: (input: { threadId: string }) =>
        Effect.sync(() => {
          calls.push(`read ${input.threadId}`);
          return { threads };
        }),
      watch: (_input: { afterSequence?: number }) =>
        Stream.make(
          { kind: "thread.updated", sequence: 1, location: "active", thread: theirs },
          { kind: "synchronized" },
        ),
    });
    expect((yield* handlers.read({ threadId: "mine" })).threads.map((entry) => entry.id)).toEqual([
      "mine",
      "my-agents",
    ]);
    expect(Exit.isFailure(yield* Effect.exit(handlers.read({ threadId: "theirs" })))).toBe(true);
    // The refused request never reached the handler.
    expect(calls).toEqual(["read mine"]);
    expect(yield* Stream.runCollect(handlers.watch({}))).toEqual([
      { kind: "thread.removed", sequence: 1, location: "active", threadId: "theirs" },
      { kind: "synchronized" },
    ]);
  }),
);
