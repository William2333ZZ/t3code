import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import type { CustomerProjectStatus } from "./customerProjects.logic";

/** Where an employee is with someone's work, as their companion acts it out. */
export type EmployeeWorkState = "idle" | "working" | "waiting" | "failed" | "finished";

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
  waiting: "waiting",
  failed: "failed",
  finished: "jumping",
};

export function companionAnimation(state: EmployeeWorkState): CompanionAnimation {
  return ANIMATION_BY_STATE[state];
}

/** Every animation plays this many times, then rests on its row's first frame: no screen keeps repainting. */
export const COMPANION_PLAYS = 3;

const JUST_FINISHED_MS = 5 * 60_000;

/** One thread's state for its employee. */
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
 * The sheet URL a client may draw: an absolute https address or a data image. A relative one would
 * resolve against whichever client draws it, not the environment. Anything else gets the robot.
 */
export function companionSheetUrl(raw: string | undefined): string | null {
  if (raw === undefined || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.protocol === "https:") return url.href;
  return url.protocol === "data:" && /^data:image\//i.test(url.href) ? url.href : null;
}

/** Whether a loaded image has the shape of a Petdex sheet of this version, or of either without one. */
export function companionSheetFits(width: number, height: number, version?: 1 | 2): boolean {
  if (width <= 0 || height <= 0) return false;
  const rows = version === undefined ? [9, 11] : [version === 2 ? 11 : 9];
  return rows.some(
    (count) =>
      Math.abs(
        width / height -
          (COMPANION_COLUMNS * COMPANION_FRAME_WIDTH) / (count * COMPANION_FRAME_HEIGHT),
      ) < 0.01,
  );
}
