import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { CustomerWorkspace } from "../customer/CustomerWorkspace";

export const Route = createFileRoute("/c/$environmentId/$projectId")({
  component: CustomerProjectRoute,
});

function CustomerProjectRoute() {
  const { environmentId, projectId } = Route.useParams();
  return (
    <CustomerWorkspace
      projectRef={scopeProjectRef(environmentId as EnvironmentId, projectId as ProjectId)}
    />
  );
}
