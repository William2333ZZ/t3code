import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { redirect } from "@tanstack/react-router";

import { readThreadShell } from "../state/entities";
import { resolveUiFace, resolveUiNavigation, type UiIdentity } from "./customerMode";

function overrideStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Storage can be blocked; the override then lasts for the one navigation that carries it.
    return null;
  }
}

/**
 * The root route calls this on every navigation of a signed-in session. It returns whether the
 * session is in one of the /c faces, and throws the redirect that keeps each UI on its own routes.
 */
export function enforceUiMode(
  identity: UiIdentity | undefined,
  location: { readonly pathname: string; readonly search: Readonly<Record<string, unknown>> },
): boolean {
  const { mode, redirect: target } = resolveUiNavigation({
    identity,
    pathname: location.pathname,
    search: location.search,
    storage: overrideStorage(),
    dev: import.meta.env.DEV,
    readThreadProjectId: (environmentId, threadId) =>
      readThreadShell(scopeThreadRef(environmentId as EnvironmentId, threadId as ThreadId))
        ?.projectId ?? null,
  });
  if (target === null) return mode !== "full";
  if (target.to === "/c/$environmentId/$projectId") {
    throw redirect({ to: target.to, params: target.params, replace: true });
  }
  throw redirect({ to: target.to, replace: true });
}

/** The face /c shows this session, after the root route has stored any `?ui=` override. */
export function currentUiFace(
  identity: UiIdentity | undefined,
  search: Readonly<Record<string, unknown>>,
): "customer" | "operator" {
  return resolveUiFace({ identity, search, storage: overrideStorage(), dev: import.meta.env.DEV });
}
