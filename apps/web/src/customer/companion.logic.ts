import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import type { CustomerProjectStatus } from "./customerProjects.logic";

/** Where an employee is with someone's work, as their companion acts it out. */
export type EmployeeWorkState =
  | "idle"
  | "working"
  | "verifying"
  | "waiting"
  | "failed"
  | "finished";

/** A row of a Petdex spritesheet; `waving` is only ever a greeting. */
export type CompanionAnimation =
  | "idle"
  | "running"
  | "review"
  | "waiting"
  | "failed"
  | "jumping"
  | "waving";

const COMPANION_FRAME_WIDTH = 192;
const COMPANION_FRAME_HEIGHT = 208;
const COMPANION_COLUMNS = 8;

// Frame counts are what Petdex sheets hold in practice; the rows are fixed by the format.
export const COMPANION_ANIMATIONS: Record<
  CompanionAnimation,
  { readonly row: number; readonly frames: number; readonly durationMs: number }
> = {
  idle: { row: 0, frames: 6, durationMs: 1200 },
  waving: { row: 3, frames: 4, durationMs: 900 },
  jumping: { row: 4, frames: 5, durationMs: 1000 },
  failed: { row: 5, frames: 8, durationMs: 1300 },
  waiting: { row: 6, frames: 6, durationMs: 1300 },
  running: { row: 7, frames: 6, durationMs: 900 },
  review: { row: 8, frames: 6, durationMs: 1100 },
};

const ANIMATION_BY_STATE: Record<EmployeeWorkState, CompanionAnimation> = {
  idle: "idle",
  working: "running",
  verifying: "review",
  waiting: "waiting",
  failed: "failed",
  finished: "jumping",
};

export function companionAnimation(state: EmployeeWorkState): CompanionAnimation {
  return ANIMATION_BY_STATE[state];
}

/**
 * Only work in progress loops: anything else plays a few times and rests on its first frame, so
 * an idle screen does not keep repainting.
 */
export function companionLoops(animation: CompanionAnimation): boolean {
  return animation === "running" || animation === "review";
}

const JUST_FINISHED_MS = 5 * 60_000;

/**
 * One thread's state for its employee. Nothing reports verification yet, so `verifying` is never
 * derived here; the companion can still show it when something does.
 */
export function employeeWorkState(
  status: CustomerProjectStatus,
  latestRun: EnvironmentThreadShell["latestRun"],
  nowMs: number,
): EmployeeWorkState {
  switch (status) {
    case "working":
      return "working";
    case "needs-answer":
    case "blocked":
      return "waiting";
    case "failed":
      return "failed";
    case "idle": {
      const completedAt =
        latestRun?.status === "completed" && latestRun.completedAt !== null
          ? Date.parse(latestRun.completedAt)
          : Number.NaN;
      return nowMs - completedAt < JUST_FINISHED_MS ? "finished" : "idle";
    }
  }
}

const STATE_PRIORITY: ReadonlyArray<EmployeeWorkState> = [
  "working",
  "verifying",
  "waiting",
  "failed",
  "finished",
  "idle",
];

/** An employee working on several things shows the most active of them. */
export function busiestWorkState(states: ReadonlyArray<EmployeeWorkState>): EmployeeWorkState {
  return STATE_PRIORITY.find((state) => states.includes(state)) ?? "idle";
}

/**
 * The sheet URL a client may draw: http(s) or a data image, resolved against the app's own
 * address. Anything else falls back to the pixel robot.
 */
export function companionSheetUrl(raw: string | undefined, base: string): string | null {
  if (raw === undefined) return null;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  return url.protocol === "data:" && /^data:image\//i.test(url.href) ? url.href : null;
}

/** Whether a loaded image has the shape of a Petdex sheet of this version. */
export function companionSheetFits(width: number, height: number, version: 1 | 2): boolean {
  if (width <= 0 || height <= 0) return false;
  const rows = version === 2 ? 11 : 9;
  const expected = (COMPANION_COLUMNS * COMPANION_FRAME_WIDTH) / (rows * COMPANION_FRAME_HEIGHT);
  return Math.abs(width / height - expected) < 0.01;
}
