import type { ProjectEntry } from "@t3tools/contracts";

export const DOCS_DIRECTORY = "docs";

/** Whether a listing of the project's root holds a docs/ folder. */
export function hasDocsFolder(entries: ReadonlyArray<ProjectEntry>): boolean {
  return entries.some((entry) => entry.kind === "directory" && entry.path === DOCS_DIRECTORY);
}

/** The folders directly inside a listed folder of docs/, by path. */
export function projectDocFolders(entries: ReadonlyArray<ProjectEntry>): ReadonlyArray<string> {
  return entries
    .filter((entry) => entry.kind === "directory" && entry.path.startsWith(`${DOCS_DIRECTORY}/`))
    .map((entry) => entry.path)
    .toSorted((left, right) => left.localeCompare(right));
}

/** The Markdown files of a listed folder of docs/, a README first, then by path. */
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

/** A file's or folder's name for a list: its last path segment, without a Markdown extension. */
export function docTitle(path: string): string {
  return (path.split("/").at(-1) ?? path).replace(/\.(md|markdown)$/i, "");
}
