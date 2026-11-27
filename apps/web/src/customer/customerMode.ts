/** Who the session is, as the auth gate knows it. Absent for the environment's own sessions. */
export interface UiIdentity {
  readonly person: string;
  readonly manager: boolean;
}

/** `customer` and `operator` are the two faces of the app under `/c`; `full` is the developer UI. */
export type UiMode = "customer" | "operator" | "full";
export type UiModeOverride = "simple" | "ops" | "full";

const OVERRIDE_STORAGE_KEY = "supersteward:ui-mode";

type OverrideStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * A member (a person without access:write) gets the customer face, a manager the operator face,
 * and the environment's own sessions the full UI. `simple` shows the customer face to anyone;
 * `ops` and `full` are honoured only for someone who is not a member, or in a dev build. This
 * picks a UI, it is not a permission: the server decides what a session may read and do.
 */
export function resolveUiMode(input: {
  readonly identity: UiIdentity | undefined;
  readonly override: UiModeOverride | null;
  readonly dev: boolean;
}): UiMode {
  const member = input.identity !== undefined && !input.identity.manager;
  if (input.override === "simple") return "customer";
  if (member && !input.dev) return "customer";
  if (input.override === "ops") return "operator";
  if (input.override === "full") return "full";
  if (member) return "customer";
  return input.identity === undefined ? "full" : "operator";
}

/** Whether this session may look at the operator face at all; members may not. */
export function canUseOperatorFace(identity: UiIdentity | undefined): boolean {
  return identity === undefined || identity.manager;
}

const OVERRIDES = new Set<unknown>(["simple", "ops", "full"]);

function isOverride(value: unknown): value is UiModeOverride {
  return OVERRIDES.has(value);
}

/** `?ui=simple|ops|full` is remembered; any other `?ui=` value forgets it. */
export function readUiModeOverride(
  search: Readonly<Record<string, unknown>>,
  storage: OverrideStorage | null,
): UiModeOverride | null {
  const requested = search.ui;
  if (isOverride(requested)) {
    storage?.setItem(OVERRIDE_STORAGE_KEY, requested);
    return requested;
  }
  if (requested !== undefined) {
    storage?.removeItem(OVERRIDE_STORAGE_KEY);
    return null;
  }
  const stored = storage?.getItem(OVERRIDE_STORAGE_KEY);
  return isOverride(stored) ? stored : null;
}

function pathSegments(pathname: string): ReadonlyArray<string> {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Pages directly under /c. Any other `/c/<one segment>` is the developer thread route.
const CUSTOMER_PAGES = new Set(["projects", "attention", "team", "docs"]);

/** `/c`, its pages, `/c/<environment>/<project>` and `/c/docs/<environment>/<project>`. */
export function isCustomerPath(pathname: string): boolean {
  const segments = pathSegments(pathname);
  if (segments[0] !== "c") return false;
  switch (segments.length) {
    case 1:
    case 3:
      return true;
    case 2:
      return CUSTOMER_PAGES.has(segments[1]!);
    case 4:
      return segments[1] === "docs";
    default:
      return false;
  }
}

// Pages that sign a browser in; they have to work before anyone knows who the session is.
const SIGN_IN_PATHS = new Set(["pair", "connect", "connect-agent", "approve-agent", "guest"]);

export type CustomerRedirect =
  | { readonly to: "/c" }
  | {
      readonly to: "/c/$environmentId/$projectId";
      readonly params: { readonly environmentId: string; readonly projectId: string };
    };

/**
 * Where the customer UI sends a path it does not serve, or null when the path may load. A thread
 * link (a notification opens one) lands on that thread's project; everything else lands on home.
 */
export function customerRedirectTarget(
  pathname: string,
  readThreadProjectId: (environmentId: string, threadId: string) => string | null,
): CustomerRedirect | null {
  if (isCustomerPath(pathname)) return null;
  const segments = pathSegments(pathname);
  if (segments.length === 1 && SIGN_IN_PATHS.has(segments[0]!)) return null;
  const threadSegments =
    segments.length === 3 && segments[0] === "threads"
      ? segments.slice(1)
      : segments.length === 2
        ? segments
        : null;
  if (threadSegments === null) return { to: "/c" };
  const [environmentId, threadId] = threadSegments.map(decodePathSegment);
  const projectId = readThreadProjectId(environmentId!, threadId!);
  return projectId === null
    ? { to: "/c" }
    : { to: "/c/$environmentId/$projectId", params: { environmentId: environmentId!, projectId } };
}

/**
 * The root route's decision for one navigation: which UI the session gets, and the redirect that
 * keeps it there. Both faces live under /c and keep the session there; leaving needs an explicit
 * `?ui=full`, so the faces' own pages stay reachable for anyone who was sent a link to one.
 */
export function resolveUiNavigation(input: {
  readonly identity: UiIdentity | undefined;
  readonly pathname: string;
  readonly search: Readonly<Record<string, unknown>>;
  readonly storage: OverrideStorage | null;
  readonly dev: boolean;
  readonly readThreadProjectId: (environmentId: string, threadId: string) => string | null;
}): { readonly mode: UiMode; readonly redirect: CustomerRedirect | { readonly to: "/" } | null } {
  const override = readUiModeOverride(input.search, input.storage);
  const mode = resolveUiMode({ identity: input.identity, override, dev: input.dev });
  if (mode !== "full") {
    return { mode, redirect: customerRedirectTarget(input.pathname, input.readThreadProjectId) };
  }
  return {
    mode,
    redirect: input.search.ui === "full" && isCustomerPath(input.pathname) ? { to: "/" } : null,
  };
}

/** The face a /c page shows: the full UI on a /c link is shown the customer face, as in v1. */
export function resolveUiFace(input: {
  readonly identity: UiIdentity | undefined;
  readonly storage: OverrideStorage | null;
  readonly dev: boolean;
}): "customer" | "operator" {
  const override = readUiModeOverride({}, input.storage);
  return resolveUiMode({ identity: input.identity, override, dev: input.dev }) === "operator"
    ? "operator"
    : "customer";
}
