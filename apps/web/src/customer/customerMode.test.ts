import { describe, expect, it } from "vite-plus/test";

import {
  canUseOperatorFace,
  customerRedirectTarget,
  isCustomerPath,
  readUiModeOverride,
  resolveUiFace,
  resolveUiMode,
  resolveUiNavigation,
} from "./customerMode";

const machine = undefined;
const manager = { person: "alice", manager: true };
const member = { person: "bob", manager: false };

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("resolveUiMode", () => {
  it.each([
    { identity: machine, override: null, dev: false, mode: "full" },
    { identity: manager, override: null, dev: false, mode: "operator" },
    { identity: member, override: null, dev: false, mode: "customer" },
    { identity: member, override: null, dev: true, mode: "customer" },
    { identity: machine, override: "simple", dev: false, mode: "customer" },
    { identity: manager, override: "simple", dev: false, mode: "customer" },
    { identity: member, override: "simple", dev: true, mode: "customer" },
    { identity: machine, override: "full", dev: false, mode: "full" },
    { identity: manager, override: "full", dev: false, mode: "full" },
    { identity: member, override: "full", dev: false, mode: "customer" },
    { identity: member, override: "full", dev: true, mode: "full" },
    { identity: machine, override: "ops", dev: false, mode: "operator" },
    { identity: manager, override: "ops", dev: false, mode: "operator" },
    { identity: member, override: "ops", dev: false, mode: "customer" },
    { identity: member, override: "ops", dev: true, mode: "operator" },
  ] as const)(
    "identity=$identity.person manager=$identity.manager override=$override dev=$dev is $mode",
    ({ identity, override, dev, mode }) => {
      expect(resolveUiMode({ identity, override, dev })).toBe(mode);
    },
  );
});

describe("readUiModeOverride", () => {
  it("remembers a requested mode and forgets it on any other value", () => {
    const storage = memoryStorage();
    expect(readUiModeOverride({ ui: "simple" }, storage)).toBe("simple");
    expect(readUiModeOverride({}, storage)).toBe("simple");
    expect(readUiModeOverride({ ui: "full" }, storage)).toBe("full");
    expect(readUiModeOverride({ ui: "ops" }, storage)).toBe("ops");
    expect(readUiModeOverride({}, storage)).toBe("ops");
    expect(readUiModeOverride({ ui: "auto" }, storage)).toBeNull();
    expect(readUiModeOverride({}, storage)).toBeNull();
  });

  it("ignores a stored value it does not know, and works without storage", () => {
    expect(readUiModeOverride({}, memoryStorage({ "supersteward:ui-mode": "other" }))).toBeNull();
    expect(readUiModeOverride({ ui: "simple" }, null)).toBe("simple");
  });
});

describe("customerRedirectTarget", () => {
  const projectOf = (environmentId: string, threadId: string) =>
    environmentId === "env-1" && threadId === "thread-1" ? "project-1" : null;

  it.each([
    "/c",
    "/c/",
    "/c/env-1/project-1",
    "/c/projects",
    "/c/attention",
    "/c/team",
    "/c/docs",
    "/c/docs/env-1/project-1",
    "/pair",
    "/connect",
    "/connect-agent",
    "/guest",
  ])("lets %s load", (pathname) => {
    expect(customerRedirectTarget(pathname, projectOf)).toBeNull();
  });

  it.each([
    "/",
    "/settings",
    "/settings/general",
    "/welcome",
    "/issues",
    "/projects/some-key",
    "/draft/draft-1",
    "/env-1/unknown-thread",
    // One segment under /c is the developer thread route with an environment named "c".
    "/c/thread-1",
    "/c/env-1/project-1/extra",
    "/c/env-1/project-1/docs",
  ])("sends %s home", (pathname) => {
    expect(customerRedirectTarget(pathname, projectOf)).toEqual({ to: "/c" });
  });

  it.each(["/env-1/thread-1", "/threads/env-1/thread-1"])(
    "sends the thread link %s to its project",
    (pathname) => {
      expect(customerRedirectTarget(pathname, projectOf)).toEqual({
        to: "/c/$environmentId/$projectId",
        params: { environmentId: "env-1", projectId: "project-1" },
      });
    },
  );
});

describe("resolveUiNavigation", () => {
  const base = {
    storage: null,
    dev: false,
    readThreadProjectId: () => null,
  };

  it("keeps a member inside the customer UI", () => {
    expect(
      resolveUiNavigation({ ...base, identity: member, pathname: "/settings", search: {} }),
    ).toEqual({ mode: "customer", redirect: { to: "/c" } });
    expect(resolveUiNavigation({ ...base, identity: member, pathname: "/c", search: {} })).toEqual({
      mode: "customer",
      redirect: null,
    });
  });

  it("does not let a member's ?ui=full out of it in a production build", () => {
    expect(
      resolveUiNavigation({ ...base, identity: member, pathname: "/", search: { ui: "full" } }),
    ).toEqual({ mode: "customer", redirect: { to: "/c" } });
  });

  it("keeps a manager in the operator face, and takes them out of /c only when asked", () => {
    expect(resolveUiNavigation({ ...base, identity: manager, pathname: "/", search: {} })).toEqual({
      mode: "operator",
      redirect: { to: "/c" },
    });
    expect(resolveUiNavigation({ ...base, identity: manager, pathname: "/c", search: {} })).toEqual(
      { mode: "operator", redirect: null },
    );
    expect(
      resolveUiNavigation({ ...base, identity: manager, pathname: "/c", search: { ui: "full" } }),
    ).toEqual({ mode: "full", redirect: { to: "/" } });
  });

  it("leaves the environment's own session in the full UI unless it asks for a face", () => {
    expect(resolveUiNavigation({ ...base, identity: machine, pathname: "/", search: {} })).toEqual({
      mode: "full",
      redirect: null,
    });
    expect(
      resolveUiNavigation({ ...base, identity: machine, pathname: "/", search: { ui: "ops" } }),
    ).toEqual({ mode: "operator", redirect: { to: "/c" } });
  });

  it("shows anyone the customer UI on ?ui=simple, and remembers it", () => {
    const storage = memoryStorage();
    expect(
      resolveUiNavigation({
        ...base,
        storage,
        identity: machine,
        pathname: "/",
        search: { ui: "simple" },
      }),
    ).toEqual({ mode: "customer", redirect: { to: "/c" } });
    expect(
      resolveUiNavigation({ ...base, storage, identity: machine, pathname: "/issues", search: {} }),
    ).toEqual({ mode: "customer", redirect: { to: "/c" } });
  });
});

describe("isCustomerPath", () => {
  it("matches only the customer routes", () => {
    expect(isCustomerPath("/c")).toBe(true);
    expect(isCustomerPath("/c/env/project")).toBe(true);
    expect(isCustomerPath("/c/team")).toBe(true);
    expect(isCustomerPath("/c/docs/env/project")).toBe(true);
    expect(isCustomerPath("/c/thread")).toBe(false);
    expect(isCustomerPath("/c/env/project/more")).toBe(false);
    expect(isCustomerPath("/chat")).toBe(false);
  });
});

describe("resolveUiFace", () => {
  it("shows the face the stored override and the identity choose", () => {
    expect(
      resolveUiFace({ identity: manager, search: {}, storage: memoryStorage(), dev: false }),
    ).toBe("operator");
    const simple = memoryStorage({ "supersteward:ui-mode": "simple" });
    expect(resolveUiFace({ identity: manager, search: {}, storage: simple, dev: false })).toBe(
      "customer",
    );
    const ops = memoryStorage({ "supersteward:ui-mode": "ops" });
    expect(resolveUiFace({ identity: member, search: {}, storage: ops, dev: false })).toBe(
      "customer",
    );
    // The full UI asked to show a /c page gets the customer face, as before.
    expect(
      resolveUiFace({ identity: machine, search: {}, storage: memoryStorage(), dev: false }),
    ).toBe("customer");
    // Without browser storage the link's own `?ui=` still decides.
    expect(
      resolveUiFace({ identity: manager, search: { ui: "simple" }, storage: null, dev: false }),
    ).toBe("customer");
  });

  it("offers the operator face to everyone but members", () => {
    expect(canUseOperatorFace(machine)).toBe(true);
    expect(canUseOperatorFace(manager)).toBe(true);
    expect(canUseOperatorFace(member)).toBe(false);
  });
});
