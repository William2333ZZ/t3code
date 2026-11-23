import { EnvironmentEmployee } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

// A JSON file naming the employee this environment's agent works as. Whoever provisions the
// workstation writes it; nothing in T3 Code does.
const employeeFile = Config.String("T3CODE_EMPLOYEE_FILE").pipe(Config.option);

const decodeEmployee = Schema.decodeUnknownEffect(Schema.fromJsonString(EnvironmentEmployee));

/** The employee profile, or none when the file is unset, missing or not a profile. */
export const resolveServerEmployee = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* employeeFile.pipe(Effect.orElseSucceed(() => Option.none<string>()));
  if (Option.isNone(path)) return Option.none<EnvironmentEmployee>();
  return yield* fileSystem.readFileString(path.value).pipe(
    Effect.flatMap(decodeEmployee),
    Effect.asSome,
    // A broken profile must not keep the server from starting; it runs as an ordinary machine.
    Effect.catch((cause) =>
      Effect.logWarning("Ignoring the employee profile: it could not be read.").pipe(
        Effect.annotateLogs({ path: path.value, cause: String(cause) }),
        Effect.as(Option.none<EnvironmentEmployee>()),
      ),
    ),
  );
});

/** How clients name the environment when its agent is an employee. */
export const employeeEnvironmentLabel = (employee: EnvironmentEmployee) =>
  employee.title === undefined ? employee.name : `${employee.name} · ${employee.title}`;
