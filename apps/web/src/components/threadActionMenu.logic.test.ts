import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadActionMenuItems,
  buildThreadOwnerMenuItems,
  knownThreadOwners,
  threadOwnerActionTarget,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });

  it("disables only rename where no inline title editor exists", () => {
    const items = buildThreadActionMenuItems({ ...baseState, canRename: false });
    expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(["rename"]);
  });
});

describe("thread owner menu", () => {
  const people = ["alice", "bob", "carol"];
  it.each([
    // A session that is no one's manages every thread.
    {
      current: "alice",
      me: undefined,
      ids: ["owner:give:bob", "owner:give:carol", "owner:release"],
    },
    {
      current: null,
      me: undefined,
      ids: ["owner:give:alice", "owner:give:bob", "owner:give:carol"],
    },
    // My thread: hand it on or release it.
    { current: "alice", me: "alice", ids: ["owner:give:bob", "owner:give:carol", "owner:release"] },
    // Nobody's: claim it, but not for someone else.
    { current: null, me: "bob", ids: ["owner:claim"] },
    // Someone else's: nothing the server would accept.
    { current: "alice", me: "bob", ids: [] },
  ])("owner $current seen by $me offers $ids", ({ ids, ...owner }) => {
    expect(buildThreadOwnerMenuItems({ ...owner, people }).map((item) => item.id)).toEqual(ids);
  });

  it("leaves the entry out where there is nothing to offer, or no permission to change threads", () => {
    const ids = (state: ThreadActionMenuState) =>
      buildThreadActionMenuItems(state).map((item) => item.id);
    const owner = { current: null, me: "bob", people };
    expect(ids({ ...baseState, owner })).toContain("owner");
    expect(ids({ ...baseState, owner, canOperate: false })).not.toContain("owner");
    expect(ids({ ...baseState, owner: { current: "alice", me: "bob", people } })).not.toContain(
      "owner",
    );
    expect(ids(baseState)).not.toContain("owner");
  });

  it("knows the people of one environment, and what each action asks for", () => {
    const threads = [
      { environmentId: "shared", owner: "carol" },
      { environmentId: "shared", owner: null },
      { environmentId: "other", owner: "dave" },
    ];
    expect(knownThreadOwners(threads, "shared", "alice")).toEqual(["alice", "carol"]);
    // Someone paired who has no thread yet can still be handed one.
    expect(knownThreadOwners(threads, "shared", "alice", ["bob"])).toEqual([
      "alice",
      "bob",
      "carol",
    ]);
    expect(knownThreadOwners(threads, "solo", undefined)).toEqual([]);
    expect(threadOwnerActionTarget("owner:claim", "bob")).toBe("bob");
    expect(threadOwnerActionTarget("owner:release", "bob")).toBeNull();
    expect(threadOwnerActionTarget("owner:give:carol", "bob")).toBe("carol");
    expect(threadOwnerActionTarget("pin", "bob")).toBeUndefined();
  });
});
