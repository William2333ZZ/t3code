import { useAtomValue } from "@effect/atom-react";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import {
  type AuthEnvironmentScope,
  type AuthSessionState,
  AuthAccessWriteScope,
  AuthRelayConfigureScope,
  type EnvironmentId,
  sessionGrantsScope,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentAtomList, environmentIdsKey } from "./environmentAtomList";

export const environmentSession = createEnvironmentSessionAtoms(connectionAtomRuntime);
export const environmentSessionStatesAtom = environmentAtomList(
  "web-environment-session-states",
  environmentSession.sessionStateAtom,
);

const EMPTY_SESSION_STATE_ATOM = Atom.make(AsyncResult.initial<AuthSessionState>());

export function useEnvironmentScope(
  environmentId: EnvironmentId | null,
  scope: AuthEnvironmentScope,
): boolean {
  // Select the grant: every revalidation emits a new result, and most consumers are list rows.
  return useAtomValue(
    environmentId === null
      ? EMPTY_SESSION_STATE_ATOM
      : environmentSession.sessionStateAtom(environmentId),
    (result) => sessionHasScope(result, scope),
  );
}

export function useEnvironmentCanConfigureRelay(environmentId: EnvironmentId | null): boolean {
  return useAtomValue(
    environmentId === null
      ? EMPTY_SESSION_STATE_ATOM
      : environmentSession.sessionStateAtom(environmentId),
    (result) => sessionHasScope(result, AuthRelayConfigureScope),
  );
}

export function readEnvironmentCanConfigureRelay(environmentId: EnvironmentId): boolean {
  const result = appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId));
  return sessionHasScope(result, AuthRelayConfigureScope);
}

/** Who this client is paired as on an environment, if it names its people. */
export function readEnvironmentPerson(environmentId: EnvironmentId): string | undefined {
  const result = appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId));
  return AsyncResult.getOrElse(result, () => null)?.person;
}

/** Everyone paired on an environment, as its server last reported. */
export function readEnvironmentPeople(environmentId: EnvironmentId): ReadonlyArray<string> {
  const result = appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId));
  return AsyncResult.getOrElse(result, () => null)?.people ?? [];
}

export function sessionHasScope(
  result: AsyncResult.AsyncResult<AuthSessionState, unknown>,
  scope: AuthEnvironmentScope,
): boolean {
  const session = AsyncResult.getOrElse(result, () => null);
  return result._tag !== "Failure" && session !== null && sessionGrantsScope(session, scope);
}

const environmentsWithScopeAtom = Atom.family((key: string) => {
  const [scope, idsKey = ""] = key.split(/\n(.*)/s) as [AuthEnvironmentScope, string?];
  const ids = idsKey === "" ? [] : (idsKey.split("\n") as EnvironmentId[]);
  const statesAtom = environmentSessionStatesAtom(idsKey);
  return Atom.make((get) => {
    const states = get(statesAtom);
    return new Set(ids.filter((_, index) => sessionHasScope(states[index]!, scope)));
  }).pipe(Atom.withLabel(`web-environments-with-scope:${key}`));
});

export function useEnvironmentsWithScope(
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId }>,
  scope: AuthEnvironmentScope,
): ReadonlySet<EnvironmentId> {
  return useAtomValue(
    environmentsWithScopeAtom(
      `${scope}\n${environmentIdsKey(environments.map(({ environmentId }) => environmentId))}`,
    ),
  );
}

export function readEnvironmentScope(
  environmentId: EnvironmentId,
  scope: AuthEnvironmentScope,
): boolean {
  return sessionHasScope(
    appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId)),
    scope,
  );
}

const EMPTY_PREPARED_CONNECTION_ATOM = Atom.make(Option.none()).pipe(
  Atom.withLabel("web-prepared-connection:empty"),
);

export function usePreparedConnection(environmentId: EnvironmentId | null) {
  return useAtomValue(
    environmentId === null
      ? EMPTY_PREPARED_CONNECTION_ATOM
      : environmentSession.preparedConnectionValueAtom(environmentId),
  );
}

/** Each environment's prepared connection, in the order of the ids. */
export const preparedConnectionsAtom = environmentAtomList(
  "web-prepared-connections",
  environmentSession.preparedConnectionValueAtom,
);

export function readPreparedConnection(environmentId: EnvironmentId) {
  return Option.getOrNull(
    appAtomRegistry.get(environmentSession.preparedConnectionValueAtom(environmentId)),
  );
}

/** data survives SWR revalidation; isPending applies only before first resolve. */
export function useEnvironmentSessionState(environmentId: EnvironmentId | null) {
  const result = useAtomValue(
    environmentId === null
      ? EMPTY_SESSION_STATE_ATOM
      : environmentSession.sessionStateAtom(environmentId),
  );
  return {
    data: AsyncResult.getOrElse(result, () => null),
    hasError: result._tag === "Failure",
    isPending: result.waiting,
  };
}

const environmentPersonsAtom = Atom.family((idsKey: string) => {
  const ids = idsKey === "" ? [] : (idsKey.split("\n") as EnvironmentId[]);
  const statesAtom = environmentSessionStatesAtom(idsKey);
  return Atom.make((get): ReadonlyMap<EnvironmentId, string> => {
    const states = get(statesAtom);
    return new Map(
      ids.flatMap((id, index) => {
        const person = AsyncResult.getOrElse(states[index]!, () => null)?.person;
        return person === undefined ? [] : [[id, person] as const];
      }),
    );
  }).pipe(Atom.withLabel(`web-environment-persons:${idsKey}`));
});

const environmentManagedAtom = Atom.family((idsKey: string) => {
  const ids = idsKey === "" ? [] : (idsKey.split("\n") as EnvironmentId[]);
  const statesAtom = environmentSessionStatesAtom(idsKey);
  return Atom.make((get): boolean => {
    const states = get(statesAtom);
    return ids.some(
      (_id, index) =>
        AsyncResult.getOrElse(states[index]!, () => null)?.person !== undefined &&
        sessionHasScope(states[index]!, AuthAccessWriteScope),
    );
  }).pipe(Atom.withLabel(`web-environment-managed:${idsKey}`));
});

/**
 * Whether this client is a named manager on any of these environments. Only a manager is sent
 * other people's threads, so only a manager has a choice between everyone's and their own.
 */
export function useManagesAnEnvironment(environmentIds: ReadonlyArray<EnvironmentId>): boolean {
  return useAtomValue(environmentManagedAtom(environmentIdsKey(environmentIds)));
}

/** Who this client is paired as, on each environment that names its people. */
export function useEnvironmentPersons(
  environmentIds: ReadonlyArray<EnvironmentId>,
): ReadonlyMap<EnvironmentId, string> {
  return useAtomValue(environmentPersonsAtom(environmentIdsKey(environmentIds)));
}
