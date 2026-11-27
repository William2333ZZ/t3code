import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { CustomerProjectDocs } from "../customer/CustomerDocs";

export const Route = createFileRoute("/c/docs/$environmentId/$projectId")({
  component: CustomerProjectDocsRoute,
});

function CustomerProjectDocsRoute() {
  const { environmentId, projectId } = Route.useParams();
  return (
    <CustomerProjectDocs
      projectRef={scopeProjectRef(environmentId as EnvironmentId, projectId as ProjectId)}
    />
  );
}
