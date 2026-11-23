import {
  AuthAccessWriteScope,
  type OrchestrationV2ThreadShell,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

/**
 * The person a session is confined to, if any. A session with no person, or one that may manage
 * who has access, runs the environment and sees every thread.
 */
export const confinedPerson = (session: {
  readonly person?: string | undefined;
  readonly scopes: Iterable<string>;
}): string | undefined =>
  session.person === undefined || [...session.scopes].includes(AuthAccessWriteScope)
    ? undefined
    : session.person;

type ThreadRow = Pick<OrchestrationV2ThreadShell, "id" | "owner" | "lineage">;

export interface ThreadConfinement {
  /** False for a thread that exists and is someone else's. A thread that does not exist is not hidden. */
  readonly mayOpen: (threadId: string) => Effect.Effect<boolean>;
  readonly rows: <Row extends ThreadRow>(rows: ReadonlyArray<Row>) => Effect.Effect<Array<Row>>;
  /** Dies when the input names someone else's thread; drops such ids from a `threadIds` list. */
  readonly input: <Input>(input: Input) => Effect.Effect<Input>;
  readonly output: <Output>(output: Output) => Effect.Effect<Output>;
  readonly streamItem: <Item>(item: Item) => Effect.Effect<Item>;
  /** The same handlers, each confined to this person's threads. */
  readonly handlers: <Handlers extends object>(handlers: Handlers) => Handlers;
}

const THREAD_ID_KEYS = [
  "threadId",
  "parentThreadId",
  "sourceThreadId",
  "fromThreadId",
  "targetThreadId",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isThreadRow = (value: unknown): value is ThreadRow =>
  isRecord(value) && typeof value.id === "string" && isRecord(value.lineage);

/**
 * What one person may see of an environment that several people share: their own threads, and
 * the threads their agents started from those. Everything a client can ask for is confined here,
 * because a client that is sent a thread can show it whatever the interface hides.
 */
export const makeThreadConfinement = <LookupError>(input: {
  readonly person: string;
  readonly getThreadShell: (
    threadId: ThreadId,
  ) => Effect.Effect<OrchestrationV2ThreadShell | null, LookupError>;
}): ThreadConfinement => {
  // A lookup that fails hides the thread: showing it would be the unsafe answer.
  const shell = (threadId: string) =>
    input.getThreadShell(threadId as ThreadId).pipe(Effect.orElseSucceed(() => undefined));

  const ownerOf = Effect.fn("threadConfinement.ownerOf")(function* (
    row: ThreadRow,
    known?: ReadonlyMap<string, ThreadRow>,
  ) {
    if (row.owner !== undefined) return row.owner.person;
    // A thread an agent started has no owner of its own; it is its root's.
    const rootId = row.lineage.rootThreadId;
    if (rootId === row.id) return undefined;
    const root = known?.get(rootId) ?? (yield* shell(rootId));
    return root?.owner?.person;
  });

  const mayOpen: ThreadConfinement["mayOpen"] = (threadId) =>
    shell(threadId).pipe(
      Effect.flatMap((found) => {
        if (found === null) return Effect.succeed(true);
        if (found === undefined) return Effect.succeed(false);
        return ownerOf(found).pipe(Effect.map((owner) => owner === input.person));
      }),
    );

  const rows: ThreadConfinement["rows"] = (all) => {
    const known = new Map<string, ThreadRow>(all.map((row) => [row.id, row]));
    return Effect.filter(all, (row) =>
      ownerOf(row, known).pipe(Effect.map((owner) => owner === input.person)),
    );
  };

  const refuse = () => Effect.die(new Error("That thread belongs to someone else."));

  const confineInput = Effect.fn("threadConfinement.input")(function* <Input>(value: Input) {
    if (!isRecord(value)) return value;
    for (const key of THREAD_ID_KEYS) {
      const id = value[key];
      if (typeof id === "string" && !(yield* mayOpen(id))) return yield* refuse();
    }
    const ids = value.threadIds;
    if (!Array.isArray(ids)) return value;
    const kept = yield* Effect.filter(ids, (id) =>
      typeof id === "string" ? mayOpen(id) : Effect.succeed(true),
    );
    return kept.length === ids.length ? value : ({ ...value, threadIds: kept } as typeof value);
  });

  const confineOutput = Effect.fn("threadConfinement.output")(function* <Output>(value: Output) {
    if (!isRecord(value)) return value;
    const next: Record<string, unknown> = { ...value };
    let changed = false;
    for (const key of ["threads", "archivedThreads"]) {
      const list = value[key];
      if (!Array.isArray(list) || !list.every(isThreadRow)) continue;
      const kept = yield* rows(list);
      if (kept.length !== list.length) {
        next[key] = kept;
        changed = true;
      }
    }
    for (const key of ["threadIds", "matches"]) {
      const list = value[key];
      if (!Array.isArray(list)) continue;
      const kept = yield* Effect.filter(list, (entry: unknown) => {
        const id = isRecord(entry) ? entry.threadId : entry;
        return typeof id === "string" ? mayOpen(id) : Effect.succeed(true);
      });
      if (kept.length !== list.length) {
        next[key] = kept;
        changed = true;
      }
    }
    return changed ? (next as typeof value) : value;
  });

  const confineStreamItem = Effect.fn("threadConfinement.streamItem")(function* <Item>(item: Item) {
    if (!isRecord(item)) return item;
    if (item.kind === "snapshot" && isRecord(item.snapshot)) {
      const snapshot = yield* confineOutput(item.snapshot);
      return snapshot === item.snapshot ? item : ({ ...item, snapshot } as typeof item);
    }
    if (item.kind === "thread.updated" && isThreadRow(item.thread)) {
      const [kept] = yield* rows([item.thread]);
      if (kept !== undefined) return item;
      // A thread handed to someone else leaves this person's list the way a deleted one does.
      return {
        kind: "thread.removed",
        sequence: item.sequence,
        location: item.location,
        threadId: item.thread.id,
      } as unknown as typeof item;
    }
    return item;
  });

  const handlers: ThreadConfinement["handlers"] = (all) =>
    Object.fromEntries(
      Object.entries(all).map(([name, handler]) => {
        if (typeof handler !== "function") return [name, handler];
        const run = handler as (payload: unknown, ...rest: ReadonlyArray<unknown>) => unknown;
        return [
          name,
          (sent: unknown, ...rest: ReadonlyArray<unknown>) => {
            // A client that resumes its thread list keeps the rows it has, including ones it
            // may no longer see. Without a cursor the server sends the list afresh.
            const payload =
              name.endsWith("subscribeShell") && isRecord(sent)
                ? Object.fromEntries(
                    Object.entries(sent).filter(([key]) => key !== "afterSequence"),
                  )
                : sent;
            // Handlers only describe work, so asking once which kind this is starts nothing.
            const first = run(payload, ...rest);
            const again = (checked: unknown) =>
              checked === payload ? first : run(checked, ...rest);
            if (Stream.isStream(first)) {
              return Stream.unwrap(
                confineInput(payload).pipe(
                  Effect.map((checked) =>
                    Stream.mapEffect(again(checked) as Stream.Stream<unknown>, confineStreamItem),
                  ),
                ),
              );
            }
            if (!Effect.isEffect(first)) return first;
            return confineInput(payload).pipe(
              Effect.flatMap(
                // The handler's own error and requirement types pass through the cast below.
                (checked) => again(checked) as Effect.Effect<unknown>,
              ),
              Effect.flatMap(confineOutput),
            );
          },
        ];
      }),
    ) as typeof all;

  return {
    mayOpen,
    rows,
    input: confineInput,
    output: confineOutput,
    streamItem: confineStreamItem,
    handlers,
  };
};
