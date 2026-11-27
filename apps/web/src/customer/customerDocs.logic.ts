import type { ProjectEntry } from "@t3tools/contracts";

export const DOCS_DIRECTORY = "docs";

/** The Markdown files under a project's docs/ folder, a README first, then by path. */
export function projectDocFiles(entries: ReadonlyArray<ProjectEntry>): ReadonlyArray<string> {
  const isReadme = (path: string) => /(^|\/)readme\.(md|markdown)$/i.test(path);
  return entries
    .filter(
      (entry) =>
        entry.kind === "file" &&
        entry.path.startsWith(`${DOCS_DIRECTORY}/`) &&
        /\.(md|markdown)$/i.test(entry.path),
    )
    .map((entry) => entry.path)
    .toSorted(
      (left, right) =>
        Number(isReadme(right)) - Number(isReadme(left)) || left.localeCompare(right),
    );
}

/** A file's name for a list: its path inside docs/, without the extension. */
export function docTitle(path: string): string {
  return path.slice(DOCS_DIRECTORY.length + 1).replace(/\.(md|markdown)$/i, "");
}
