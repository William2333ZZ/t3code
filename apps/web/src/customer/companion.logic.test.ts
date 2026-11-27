import { RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  COMPANION_ANIMATIONS,
  busiestWorkState,
  companionAnimation,
  companionLoops,
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
    ["verifying", "review", 8],
    ["waiting", "waiting", 6],
    ["failed", "failed", 5],
    ["finished", "jumping", 4],
  ] as const)("acts out %s with the %s row", (state, animation, row) => {
    expect(companionAnimation(state)).toBe(animation);
    expect(COMPANION_ANIMATIONS[animation].row).toBe(row);
  });

  it("loops only work in progress", () => {
    expect(companionLoops("running")).toBe(true);
    expect(companionLoops("review")).toBe(true);
    expect(companionLoops("idle")).toBe(false);
    expect(companionLoops("waiting")).toBe(false);
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
  const base = "https://app.example/c";

  it("accepts web and data-image addresses and resolves relative ones", () => {
    expect(companionSheetUrl("https://pets.example/a.webp", base)).toBe(
      "https://pets.example/a.webp",
    );
    expect(companionSheetUrl("/pets/a.webp", base)).toBe("https://app.example/pets/a.webp");
    expect(companionSheetUrl("data:image/webp;base64,AAAA", base)).toBe(
      "data:image/webp;base64,AAAA",
    );
  });

  it("falls back for anything else", () => {
    expect(companionSheetUrl(undefined, base)).toBeNull();
    expect(companionSheetUrl("javascript:alert(1)", base)).toBeNull();
    expect(companionSheetUrl("data:text/html,<b>", base)).toBeNull();
    expect(companionSheetUrl("file:///etc/passwd", base)).toBeNull();
    expect(companionSheetUrl("http://[", base)).toBeNull();
  });

  it("checks the sheet's shape against its version", () => {
    expect(companionSheetFits(1536, 1872, 1)).toBe(true);
    expect(companionSheetFits(1536, 2288, 2)).toBe(true);
    expect(companionSheetFits(1536, 2288, 1)).toBe(false);
    expect(companionSheetFits(768, 936, 1)).toBe(true);
    expect(companionSheetFits(512, 512, 1)).toBe(false);
    expect(companionSheetFits(0, 0, 1)).toBe(false);
  });
});
