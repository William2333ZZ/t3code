import type { EnvironmentIdentity } from "~/state/session";

/** One name when the client is the same person everywhere, otherwise each of them. */
export function identitySummary(identities: ReadonlyArray<Pick<EnvironmentIdentity, "person">>) {
  return [...new Set(identities.map((identity) => identity.person))].join(" · ");
}

/** The people a manager can become on an environment: themself first, then everyone else known there. */
export function switchablePeople(identity: EnvironmentIdentity): ReadonlyArray<string> {
  if (!identity.manager) return [];
  const own = identity.self ?? identity.person;
  return [own, ...identity.people.filter((person) => person !== own)];
}
