export type UiFace = "customer" | "operator";

export type SidebarItemId = "home" | "attention" | "projects" | "team" | "docs";

/**
 * The sidebar's navigation for a face. Every item has a page behind it; documents need file
 * access, which a member's link does not carry unless whoever paired them gave it.
 */
export function sidebarItems(
  face: UiFace,
  access: { readonly canReadFiles: boolean },
): ReadonlyArray<SidebarItemId> {
  const items: SidebarItemId[] =
    face === "operator" ? ["home", "attention", "projects", "team"] : ["home", "projects", "team"];
  if (access.canReadFiles) items.push("docs");
  return items;
}

function segmentsOf(pathname: string): ReadonlyArray<string> {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

/** The project a /c path is about, if any: its workspace or its documents. */
export function projectOfPath(
  pathname: string,
): { readonly environmentId: string; readonly projectId: string } | null {
  const segments = segmentsOf(pathname).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  if (segments[0] !== "c") return null;
  if (segments.length === 3 && segments[1] !== "docs") {
    return { environmentId: segments[1]!, projectId: segments[2]! };
  }
  if (segments.length === 4 && segments[1] === "docs") {
    return { environmentId: segments[2]!, projectId: segments[3]! };
  }
  return null;
}

/** Which item a /c path belongs to; a project's workspace belongs to none. */
export function activeSidebarItem(pathname: string): SidebarItemId | null {
  const segments = segmentsOf(pathname);
  if (segments[0] !== "c") return null;
  if (segments.length === 1) return "home";
  switch (segments[1]) {
    case "attention":
      return "attention";
    case "projects":
      return "projects";
    case "team":
      return "team";
    case "docs":
      return "docs";
    default:
      return null;
  }
}

/** Inside a project the sidebar folds to an icon rail, unless the person opened it there. */
export function sidebarCollapsed(
  inProject: boolean,
  toggledIn: "project" | "page" | null,
): boolean {
  return inProject ? toggledIn !== "project" : toggledIn === "page";
}
