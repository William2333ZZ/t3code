import { describe, expect, it } from "vite-plus/test";

import { docTitle, projectDocFiles } from "./customerDocs.logic";
import {
  activeSidebarItem,
  projectOfPath,
  sidebarCollapsed,
  sidebarItems,
} from "./faceSidebar.logic";

describe("sidebarItems", () => {
  it.each([
    ["customer", false, ["home", "projects", "team"]],
    ["customer", true, ["home", "projects", "team", "docs"]],
    ["operator", false, ["home", "attention", "projects", "team"]],
    ["operator", true, ["home", "attention", "projects", "team", "docs"]],
  ] as const)("%s with file access %s", (face, canReadFiles, items) => {
    expect(sidebarItems(face, { canReadFiles })).toEqual(items);
  });
});

describe("sidebar location", () => {
  it.each([
    ["/c", "home", null],
    ["/c/attention", "attention", null],
    ["/c/projects", "projects", null],
    ["/c/team", "team", null],
    ["/c/docs", "docs", null],
    ["/c/docs/env-1/p%201", "docs", { environmentId: "env-1", projectId: "p 1" }],
    ["/c/env-1/project-1", null, { environmentId: "env-1", projectId: "project-1" }],
    ["/settings", null, null],
  ] as const)("%s", (pathname, item, project) => {
    expect(activeSidebarItem(pathname)).toBe(item);
    expect(projectOfPath(pathname)).toEqual(project);
  });

  it("folds inside a project unless opened there, and opens elsewhere unless folded", () => {
    expect(sidebarCollapsed(true, null)).toBe(true);
    expect(sidebarCollapsed(true, "project")).toBe(false);
    expect(sidebarCollapsed(true, "page")).toBe(true);
    expect(sidebarCollapsed(false, null)).toBe(false);
    expect(sidebarCollapsed(false, "page")).toBe(true);
    expect(sidebarCollapsed(false, "project")).toBe(false);
  });
});

describe("projectDocFiles", () => {
  it("lists Markdown under docs/, a README first", () => {
    expect(
      projectDocFiles([
        { path: "docs/zeta.md", kind: "file" },
        { path: "docs/guide", kind: "directory" },
        { path: "docs/guide/setup.markdown", kind: "file" },
        { path: "docs/README.md", kind: "file" },
        { path: "docs/logo.png", kind: "file" },
        { path: "README.md", kind: "file" },
        { path: "src/docs/x.md", kind: "file" },
      ]),
    ).toEqual(["docs/README.md", "docs/guide/setup.markdown", "docs/zeta.md"]);
    expect(docTitle("docs/guide/setup.markdown")).toBe("guide/setup");
  });
});
