import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

// "acting" is the person a manager's session has switched to; "session" stays its own.
export type PersonBindingKind = "pairing-link" | "session" | "acting";

/**
 * Which person a pairing link or a session belongs to, on an environment several people share.
 *
 * The table is created here instead of by a numbered migration. This fork tracks upstream, whose
 * migrator skips every id up to the highest one a database has recorded: a migration numbered
 * here would collide with the next one upstream adds.
 */
export class PersonBindings extends Context.Service<
  PersonBindings,
  {
    readonly bind: (kind: PersonBindingKind, id: string, person: string) => Effect.Effect<void>;
    readonly unbind: (kind: PersonBindingKind, id: string) => Effect.Effect<void>;
    readonly get: (kind: PersonBindingKind, id: string) => Effect.Effect<string | undefined>;
    readonly list: (kind: PersonBindingKind) => Effect.Effect<ReadonlyMap<string, string>>;
  }
>()("t3/auth/PersonBindings") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS person_bindings (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      person TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    )
  `.pipe(Effect.orDie);

  // Every authenticated request asks whose session it is, so answers stay in memory.
  const known = new Map<string, string | undefined>();
  const key = (kind: PersonBindingKind, id: string) => `${kind}\n${id}`;

  const bind: PersonBindings["Service"]["bind"] = Effect.fn("PersonBindings.bind")(
    function* (kind, id, person) {
      yield* sql`
        INSERT INTO person_bindings (kind, id, person) VALUES (${kind}, ${id}, ${person})
        ON CONFLICT (kind, id) DO UPDATE SET person = excluded.person
      `.pipe(Effect.orDie);
      known.set(key(kind, id), person);
    },
  );

  const unbind: PersonBindings["Service"]["unbind"] = Effect.fn("PersonBindings.unbind")(
    function* (kind, id) {
      yield* sql`DELETE FROM person_bindings WHERE kind = ${kind} AND id = ${id}`.pipe(
        Effect.orDie,
      );
      known.set(key(kind, id), undefined);
    },
  );

  const get: PersonBindings["Service"]["get"] = Effect.fn("PersonBindings.get")(
    function* (kind, id) {
      const cacheKey = key(kind, id);
      if (known.has(cacheKey)) return known.get(cacheKey);
      const rows = yield* sql<{ readonly person: string }>`
        SELECT person FROM person_bindings WHERE kind = ${kind} AND id = ${id}
      `.pipe(Effect.orDie);
      const person = rows[0]?.person;
      known.set(cacheKey, person);
      return person;
    },
  );

  const list: PersonBindings["Service"]["list"] = Effect.fn("PersonBindings.list")(
    function* (kind) {
      const rows = yield* sql<{ readonly id: string; readonly person: string }>`
        SELECT id, person FROM person_bindings WHERE kind = ${kind}
      `.pipe(Effect.orDie);
      return new Map(rows.map((row) => [row.id, row.person]));
    },
  );

  return PersonBindings.of({ bind, unbind, get, list });
});

export const layer = Layer.effect(PersonBindings, make);
