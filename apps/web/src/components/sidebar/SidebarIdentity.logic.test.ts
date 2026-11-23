import type { EnvironmentId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import type { EnvironmentIdentity } from "~/state/session";

import { identitySummary, switchablePeople } from "./SidebarIdentity.logic";

const identity = (fields: Partial<EnvironmentIdentity>): EnvironmentIdentity => ({
  environmentId: "env" as EnvironmentId,
  person: "hhdz",
  self: undefined,
  people: ["alice", "hhdz", "wang"],
  manager: true,
  ...fields,
});

it("names the client once when it is the same person everywhere", () => {
  expect(identitySummary([identity({}), identity({})])).toBe("hhdz");
  expect(identitySummary([identity({}), identity({ person: "wang" })])).toBe("hhdz · wang");
});

it("offers a manager themself first, then everyone else, also while acting as someone", () => {
  expect(switchablePeople(identity({}))).toEqual(["hhdz", "alice", "wang"]);
  expect(switchablePeople(identity({ person: "wang", self: "hhdz" }))).toEqual([
    "hhdz",
    "alice",
    "wang",
  ]);
});

it("offers a member no one to switch to", () => {
  expect(switchablePeople(identity({ person: "wang", manager: false }))).toEqual([]);
});
