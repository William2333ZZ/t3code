import { RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  COMPANION_ANIMATIONS,
  busiestWorkState,
  companionAnimation,
  companionSheetFits,
  companionSheetUrl,
  employeeWorkState,
} from "./companion.logic";

const now = Date.parse("2026-03-09T12:00:00.000Z");

function run(status: "completed" | "failed", completedAt: string) {
  return {
    runId: RunId.make("run-1"),
    status,
    requestedAt: null,
    startedAt: null,
    completedAt,
    assistantMessageId: null,
  } as const;
}

describe("companionAnimation", () => {
  it.each([
    ["idle", "idle", 0],
    ["working", "running", 7],
    ["waiting", "waiting", 6],
    ["failed", "failed", 5],
    ["finished", "jumping", 4],
  ] as const)("acts out %s with the %s row", (state, animation, row) => {
    expect(companionAnimation(state)).toBe(animation);
    expect(COMPANION_ANIMATIONS[animation].row).toBe(row);
  });
});

describe("employeeWorkState", () => {
  it.each([
    ["working", null, "working"],
    ["needs-answer", null, "waiting"],
    ["blocked", null, "waiting"],
    ["failed", null, "failed"],
    ["idle", null, "idle"],
    ["idle", run("completed", "2026-03-09T11:58:00.000Z"), "finished"],
    ["idle", run("completed", "2026-03-09T11:00:00.000Z"), "idle"],
    ["idle", run("failed", "2026-03-09T11:59:00.000Z"), "idle"],
  ] as const)("a %s thread with run %j is %s", (status, latestRun, state) => {
    expect(employeeWorkState(status, latestRun, now)).toBe(state);
  });

  it("shows the most active of several", () => {
    expect(busiestWorkState(["idle", "failed", "waiting"])).toBe("waiting");
    expect(busiestWorkState(["finished", "working"])).toBe("working");
    expect(busiestWorkState([])).toBe("idle");
  });
});

describe("companion sheets", () => {
  it("accepts absolute https and data-image addresses", () => {
    expect(companionSheetUrl("https://pets.example/a.webp")).toBe("https://pets.example/a.webp");
    expect(companionSheetUrl("data:image/webp;base64,AAAA")).toBe("data:image/webp;base64,AAAA");
  });

  it("falls back for anything else", () => {
    expect(companionSheetUrl(undefined)).toBeNull();
    expect(companionSheetUrl("/pets/a.webp")).toBeNull();
    expect(companionSheetUrl("http://pets.example/a.webp")).toBeNull();
    expect(companionSheetUrl("javascript:alert(1)")).toBeNull();
    expect(companionSheetUrl("data:text/html,<b>")).toBeNull();
    expect(companionSheetUrl("file:///etc/passwd")).toBeNull();
    expect(companionSheetUrl("http://[")).toBeNull();
  });

  it("checks the sheet's shape against its version, or either version without one", () => {
    expect(companionSheetFits(1536, 1872, 1)).toBe(true);
    expect(companionSheetFits(1536, 2288, 2)).toBe(true);
    expect(companionSheetFits(1536, 2288, 1)).toBe(false);
    expect(companionSheetFits(1536, 2288)).toBe(true);
    expect(companionSheetFits(768, 936)).toBe(true);
    expect(companionSheetFits(512, 512)).toBe(false);
    expect(companionSheetFits(0, 0, 1)).toBe(false);
  });
});
