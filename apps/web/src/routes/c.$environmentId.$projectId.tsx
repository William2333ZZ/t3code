import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { CustomerWorkspace } from "../customer/CustomerWorkspace";

// `view=backstage` opens an operator on the work behind the conversation; `thread` picks one
// thread of the project when a link was about that thread rather than the project's latest.
function validateWorkspaceSearch(search: Record<string, unknown>): {
  view?: "backstage";
  thread?: string;
} {
  return {
    ...(search.view === "backstage" ? { view: "backstage" as const } : {}),
    ...(typeof search.thread === "string" && search.thread.length > 0
      ? { thread: search.thread }
      : {}),
  };
}

export const Route = createFileRoute("/c/$environmentId/$projectId")({
  validateSearch: validateWorkspaceSearch,
  component: CustomerProjectRoute,
});

function CustomerProjectRoute() {
  const { environmentId, projectId } = Route.useParams();
  const { view, thread } = Route.useSearch();
  return (
    <CustomerWorkspace
      projectRef={scopeProjectRef(environmentId as EnvironmentId, projectId as ProjectId)}
      backstage={view === "backstage"}
      threadId={thread ?? null}
    />
  );
}
