import { OrchestrationV2ThreadOwner } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as References from "effect/References";
import * as Runtime from "effect/Runtime";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { Argument, Command, GlobalFlag } from "effect/cli";

import * as ServerConfig from "../config.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { projectLocationFlags, resolveCliAuthConfig } from "./config.ts";

export class ThreadOwnerUsageError extends Schema.TaggedError<ThreadOwnerUsageError>()(
  "ThreadOwnerUsageError",
  { detail: Schema.String },
) {
  override readonly [Runtime.errorReported] = false;
  override get message(): string {
    return this.detail;
  }
}

// PortScanner.AGENT_THREAD_ENV: every provider gives its agent's shell the thread it works in.
const agentThreadId = Config.String("T3CODE_THREAD_ID").pipe(Config.option);

const decodeOwner = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ owner: Schema.optional(OrchestrationV2ThreadOwner) })),
);

/**
 * Who a thread's work is for, read from this machine's database. An agent runs it with no
 * argument to learn whose work it is doing; the server already trusts whoever can read the disk.
 */
export const threadOwnerCommand = Command.make("owner", {
  ...projectLocationFlags,
  thread: Argument.String("thread").pipe(
    Argument.withDescription("Thread id. Defaults to $T3CODE_THREAD_ID, set in an agent's shell."),
    Argument.optional,
  ),
}).pipe(
  Command.withDescription(
    "Print the person a thread's work is for, or nothing if it has no owner.",
  ),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const fromEnvironment = yield* agentThreadId.pipe(
        Effect.orElseSucceed(() => Option.none<string>()),
      );
      const threadId = Option.orElse(flags.thread, () => fromEnvironment);
      if (Option.isNone(threadId)) {
        return yield* new ThreadOwnerUsageError({
          detail: "Name a thread, or run this from an agent's shell where T3CODE_THREAD_ID is set.",
        });
      }
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig(flags, logLevel, { quietLogs: true });
      const rows = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly payload_json: string }>`
          SELECT payload_json FROM orchestration_v2_projection_threads
          WHERE thread_id = ${threadId.value}
        `;
      }).pipe(
        Effect.provide(
          SqlitePersistence.layerCliConfig.pipe(
            Layer.provide(ServerConfig.layer(config)),
            Layer.provide(Layer.succeed(References.MinimumLogLevel, "Error")),
          ),
        ),
      );
      const row = rows[0];
      if (row === undefined) {
        return yield* new ThreadOwnerUsageError({ detail: `No thread ${threadId.value} here.` });
      }
      const person = Option.getOrUndefined(decodeOwner(row.payload_json))?.owner?.person;
      if (person !== undefined) yield* Console.log(person);
    }).pipe(
      Effect.tapError((error) =>
        error._tag === "ThreadOwnerUsageError" ? Console.error(error.message) : Effect.void,
      ),
    ),
  ),
);
