import { useSyncExternalStore } from "react";

import { parseOpsLink, type OpsOverview } from "./opsOverview.logic";

const STORAGE_KEY = "supersteward:ops-source";
const REFRESH_MS = 15_000;

interface OpsSource {
  readonly base: string;
  readonly token: string;
}

export type OpsState =
  | { readonly status: "none" }
  | { readonly status: "loading"; readonly base: string }
  | { readonly status: "ready"; readonly base: string; readonly overview: OpsOverview }
  | { readonly status: "lost"; readonly base: string; readonly overview: OpsOverview | null };

function readSource(): OpsSource | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      "base" in stored &&
      "token" in stored &&
      typeof stored.base === "string" &&
      typeof stored.token === "string"
    ) {
      return { base: stored.base, token: stored.token };
    }
  } catch {
    // Storage blocked or unreadable: no connection is remembered.
  }
  return null;
}

function writeSource(source: OpsSource | null): void {
  try {
    if (source === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(source));
  } catch {
    // Storage blocked: the connection lasts until the window closes.
  }
}

let source: OpsSource | null = readSource();
let state: OpsState =
  source === null ? { status: "none" } : { status: "loading", base: source.base };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function publish(next: OpsState): void {
  state = next;
  for (const listener of listeners) listener();
}

async function refresh(): Promise<void> {
  const asked = source;
  if (asked === null) return;
  const previous = state.status === "ready" || state.status === "lost" ? state.overview : null;
  try {
    const response = await fetch(`${asked.base}/ops/data`, {
      headers: { Authorization: `Bearer ${asked.token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(String(response.status));
    const overview = (await response.json()) as OpsOverview;
    if (source === asked) publish({ status: "ready", base: asked.base, overview });
  } catch {
    // A session that ran out reads like a closed door, so any failure asks for a new link.
    if (source === asked) publish({ status: "lost", base: asked.base, overview: previous });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    timer = setInterval(() => void refresh(), REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The operators' overview of the connected SuperSteward service, refreshed while a screen shows it. */
export function useOpsOverview(): OpsState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Spend a console link for a token, remember it, and load the overview. Throws when the link does not work. */
export async function connectOps(link: string): Promise<void> {
  const parsed = parseOpsLink(link);
  if (parsed === null) throw new Error("not-a-link");
  const response = await fetch(`${parsed.base}/ops/token/${parsed.code}`, { cache: "no-store" });
  if (!response.ok) throw new Error("refused");
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("token" in body) ||
    typeof body.token !== "string"
  ) {
    throw new Error("refused");
  }
  source = { base: parsed.base, token: body.token };
  writeSource(source);
  publish({ status: "loading", base: parsed.base });
  await refresh();
}

export function disconnectOps(): void {
  source = null;
  writeSource(null);
  publish({ status: "none" });
}

/** An address the service gave relative to itself, such as a companion sheet's. */
export function opsAddress(base: string, path: string | null | undefined): string | undefined {
  return path ? new URL(path, base).href : undefined;
}
