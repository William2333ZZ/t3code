import { describe, expect, it } from "vite-plus/test";

import {
  lastFinished,
  needsYou,
  parseOpsLink,
  projectStatus,
  projectsByStatus,
  type OpsOverview,
  type OpsProject,
  type OpsTask,
} from "./opsOverview.logic";

const counts = { queued: 0, working: 0, verifying: 0, merged: 0, failed: 0 };

function project(name: string, serving = false): OpsProject {
  return {
    name,
    customers: [],
    workers: [],
    counts,
    environment: serving ? { address: `https://x/p/${name}/`, state: "live", serving } : null,
  };
}

function task(
  id: string,
  name: string,
  state: OpsTask["state"],
  at: Record<string, string> = {},
): OpsTask {
  return {
    id,
    title: id,
    project: name,
    customer: null,
    state,
    summary: null,
    worker: null,
    live: false,
    at,
  };
}

function overview(parts: Partial<OpsOverview>): OpsOverview {
  return {
    generated_at: "2026-11-27T12:00:00+0800",
    counters: {
      working: 0,
      employees: 0,
      queued: 0,
      longest_wait_minutes: null,
      merged_today: 0,
      bounced_today: 0,
      attention: 0,
    },
    employees: [],
    queue: [],
    tasks: [],
    projects: [],
    attention: [],
    ...parts,
  };
}

describe("needsYou", () => {
  it("puts stuck work first, then customers kept waiting longest, and leaves short waits out", () => {
    const items = needsYou(
      overview({
        attention: [
          { title: "排班", project: "shifts", reason: "验了 3 轮没过", since: null, task: "t1" },
        ],
        queue: [
          { id: "q1", title: "a", project: "p", customer: "王老师", waiting_minutes: 40, place: 2 },
          { id: "q2", title: "b", project: "p", customer: null, waiting_minutes: 90, place: 1 },
          { id: "q3", title: "c", project: "p", customer: null, waiting_minutes: 5, place: 3 },
        ],
      }),
    );
    expect(items.map((item) => item.key)).toEqual(["stuck:t1", "waiting:q2", "waiting:q1"]);
  });
});

describe("projectStatus", () => {
  it("names what is stuck, checked, made or waiting before whether the project is live", () => {
    const shop = project("shop", true);
    const notes = project("notes");
    const blog = project("blog", true);
    const quiet = project("quiet");
    const seen = overview({
      projects: [quiet, blog, notes, shop],
      tasks: [
        task("a", "shop", "working"),
        task("b", "shop", "verifying"),
        task("c", "notes", "queued"),
      ],
      attention: [],
    });
    expect(projectStatus(seen, shop)).toEqual({ status: "checking", task: seen.tasks[1] });
    expect(projectStatus(seen, notes).status).toBe("queued");
    expect(projectStatus(seen, blog).status).toBe("live");
    expect(projectStatus(seen, quiet).status).toBe("quiet");
    expect(projectsByStatus(seen).map((p) => p.name)).toEqual(["shop", "notes", "blog", "quiet"]);
    const stuck = overview({
      ...seen,
      attention: [{ title: null, project: "blog", reason: null, since: null, task: null }],
    });
    expect(projectStatus(stuck, blog).status).toBe("stuck");
  });

  it("finds the request that finished last", () => {
    const seen = overview({
      tasks: [
        task("old", "shop", "merged", { merged: "2026-11-26T10:00:00+0800" }),
        task("new", "shop", "failed", { failed: "2026-11-27T10:00:00+0800" }),
        task("open", "shop", "working"),
      ],
    });
    expect(lastFinished(seen, project("shop"))?.id).toBe("new");
    expect(lastFinished(seen, project("other"))).toBeNull();
  });
});

describe("parseOpsLink", () => {
  it("takes the service and the code from a console link, over https only", () => {
    expect(parseOpsLink(" https://box:41010/ops/enter/abc_-1 ")).toEqual({
      base: "https://box:41010",
      code: "abc_-1",
    });
    expect(parseOpsLink("http://box/ops/enter/abc")).toBeNull();
    expect(parseOpsLink("https://box/ops/enter/")).toBeNull();
    expect(parseOpsLink("https://box/other/abc")).toBeNull();
    expect(parseOpsLink("not a link")).toBeNull();
  });
});
