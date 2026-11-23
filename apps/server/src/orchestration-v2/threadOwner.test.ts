import { expect, it } from "vite-plus/test";

import { ownerChangeRefusal } from "./threadOwner.ts";

it.each([
  // The environment's own sessions carry no person and manage everyone's threads.
  { current: "alice", requester: undefined, target: "bob", allowed: true },
  { current: "alice", requester: undefined, target: null, allowed: true },
  // A person hands on or releases their own thread.
  { current: "alice", requester: "alice", target: "bob", allowed: true },
  { current: "alice", requester: "alice", target: null, allowed: true },
  // ...claims one nobody owns, but only for themself.
  { current: undefined, requester: "bob", target: "bob", allowed: true },
  { current: undefined, requester: "bob", target: "carol", allowed: false },
  { current: undefined, requester: "bob", target: null, allowed: false },
  // ...and never takes or reassigns someone else's.
  { current: "alice", requester: "bob", target: "bob", allowed: false },
  { current: "alice", requester: "bob", target: null, allowed: false },
])("owner $current, asked by $requester for $target: allowed $allowed", ({ allowed, ...input }) => {
  expect(ownerChangeRefusal(input) === undefined).toBe(allowed);
});
