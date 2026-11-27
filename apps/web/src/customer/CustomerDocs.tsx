import type { ScopedProjectRef } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { T } from "gt-react";
import { FileTextIcon, FolderIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import ChatMarkdown from "../components/ChatMarkdown";
import {
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "../components/files/projectFilesQueryState";
import { cn } from "../lib/utils";
import { useAllEnvironmentShellsBootstrapped, useProject } from "../state/entities";
import { useFilesystemReadAccess } from "../state/filesystem";
import { customerHue } from "./CustomerAvatar";
import {
  DOCS_DIRECTORY,
  docTitle,
  hasDocsFolder,
  projectDocFiles,
  projectDocFolders,
} from "./customerDocs.logic";
import { useCustomerFace } from "./customerFace";
import { blockNonWebLinks } from "./customerLinks";
import { useFaceProjects } from "./useFaceData";

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-muted-foreground">
      {children}
    </div>
  );
}

/** Which project's documents to read. */
export function CustomerDocsIndex() {
  const ready = useAllEnvironmentShellsBootstrapped();
  const { projects } = useFaceProjects();
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-12 pt-10 pb-8">
      <div>
        <h1 className="text-2xl font-bold">
          <T>Documents</T>
        </h1>
        <p className="text-muted-foreground">
          <T>Each project keeps its documents in its docs folder. Pick a project to read them.</T>
        </p>
      </div>
      {projects.length > 0 ? (
        <div className="flex flex-col rounded-2xl bg-card px-2 py-1 shadow-(--customer-shadow-line)">
          {projects.map((project) => (
            <Link
              key={`${project.projectRef.environmentId}:${project.projectRef.projectId}`}
              to="/c/docs/$environmentId/$projectId"
              params={project.projectRef}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-muted"
            >
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: customerHue(project.projectRef.projectId)[0] }}
              />
              <span className="flex-1 truncate font-medium">{project.title}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Notice>{ready ? <T>No projects yet.</T> : <T>Loading projects…</T>}</Notice>
      )}
    </main>
  );
}

function DocsFolder(props: {
  environmentId: ScopedProjectRef["environmentId"];
  cwd: string;
  path: string;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const { environmentId, cwd, path, depth, selected, onSelect } = props;
  const listing = useProjectEntriesQuery(environmentId, cwd, path);
  const entries = listing.data?.entries ?? [];
  const indent = { paddingLeft: `${0.625 + depth * 0.875}rem` };
  return (
    <>
      {projectDocFiles(entries).map((file) => (
        <button
          key={file}
          type="button"
          style={indent}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg py-1.75 pr-2.5 text-left hover:bg-muted",
            file === selected && "bg-muted font-semibold",
          )}
          onClick={() => onSelect(file)}
        >
          <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{docTitle(file)}</span>
        </button>
      ))}
      {projectDocFolders(entries).map((folder) => (
        <Fragment key={folder}>
          <div
            style={indent}
            className="flex items-center gap-2 py-1.75 pr-2.5 text-muted-foreground"
          >
            <FolderIcon aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{docTitle(folder)}</span>
          </div>
          <DocsFolder {...props} path={folder} depth={depth + 1} />
        </Fragment>
      ))}
    </>
  );
}

function DocsReader(props: { environmentId: ScopedProjectRef["environmentId"]; cwd: string }) {
  const { environmentId, cwd } = props;
  const { face } = useCustomerFace();
  // A missing docs/ fails like any unreadable folder, so the root listing tells the two apart.
  const root = useProjectEntriesQuery(environmentId, cwd);
  const top = useProjectEntriesQuery(environmentId, cwd, DOCS_DIRECTORY);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? projectDocFiles(top.data?.entries ?? [])[0] ?? null;
  const file = useProjectFileQuery(environmentId, cwd, selected, selected !== null);
  // The server's own words can carry paths and codes; members get a plain sentence.
  const failure = (error: string | null) =>
    face === "operator" && error ? error : <T>The documents can't be read right now.</T>;

  if (root.data !== null && !hasDocsFolder(root.data.entries)) {
    return (
      <Notice>
        <T>This project has no documents in its docs folder yet.</T>
      </Notice>
    );
  }
  if (root.error !== null || top.error !== null) {
    return <Notice>{failure(root.error ?? top.error)}</Notice>;
  }
  if (top.data === null) {
    return (
      <Notice>
        <T>Reading the docs folder…</T>
      </Notice>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto">
        <DocsFolder
          environmentId={environmentId}
          cwd={cwd}
          path={DOCS_DIRECTORY}
          depth={0}
          selected={selected}
          onSelect={setChosen}
        />
      </nav>
      <article
        className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-2xl bg-card px-7 py-6 shadow-(--customer-shadow-line)"
        onClickCapture={blockNonWebLinks}
      >
        {selected === null ? (
          <div className="text-muted-foreground">
            <T>Pick a document on the left.</T>
          </div>
        ) : file.data !== null ? (
          <ChatMarkdown text={file.data.contents} cwd={undefined} isStreaming={false} />
        ) : file.error !== null ? (
          <div className="text-muted-foreground">{failure(file.error)}</div>
        ) : (
          <div className="text-muted-foreground">
            <T>Opening the document…</T>
          </div>
        )}
        {file.data?.truncated ? (
          <div className="mt-3 text-(length:--customer-note) text-muted-foreground">
            <T>This document is long; only its beginning is shown.</T>
          </div>
        ) : null}
      </article>
    </div>
  );
}

/**
 * A project's docs/ folder, read-only, from the project's working copy on the machine. Changes go
 * through the conversation: the assistant makes them like any other change.
 */
export function CustomerProjectDocs({ projectRef }: { projectRef: ScopedProjectRef }) {
  const { face } = useCustomerFace();
  const known = useProject(projectRef);
  const { projects } = useFaceProjects();
  // Project records are shared, so a member reaches only the projects their own threads are in.
  const project =
    face === "operator" ||
    projects.some(
      (own) =>
        own.projectRef.environmentId === projectRef.environmentId &&
        own.projectRef.projectId === projectRef.projectId,
    )
      ? known
      : null;
  const access = useFilesystemReadAccess(projectRef.environmentId);
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 px-12 pt-10 pb-8">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">
            {project === null ? <T>Documents</T> : project.title}
          </h1>
          <p className="text-muted-foreground">
            <T>Documents in this project's docs folder.</T>
          </p>
        </div>
        {project !== null ? (
          <Link
            to="/c/$environmentId/$projectId"
            params={projectRef}
            className="shrink-0 rounded-lg border border-border bg-card px-3.5 py-1.25"
          >
            <T>Back to the project</T>
          </Link>
        ) : null}
      </div>
      {face === "customer" ? (
        <div className="rounded-xl bg-info/10 px-4 py-2.5 text-(length:--customer-note) text-info-foreground">
          <T>
            Want to change something? Say so in the conversation, and the front desk will propose
            the change.
          </T>
        </div>
      ) : null}
      {project === null ? (
        <Notice>
          <T>This project isn't available here.</T>
        </Notice>
      ) : access.isPending ? (
        <Notice>
          <T>Reading the docs folder…</T>
        </Notice>
      ) : !access.canReadFiles ? (
        <Notice>
          <T>This connection can't read the project's files, so its documents can't be shown.</T>
        </Notice>
      ) : (
        <DocsReader
          key={`${projectRef.environmentId}:${project.workspaceRoot}`}
          environmentId={projectRef.environmentId}
          cwd={project.workspaceRoot}
        />
      )}
    </main>
  );
}
