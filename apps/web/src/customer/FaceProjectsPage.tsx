import { T } from "gt-react";

import { useAllEnvironmentShellsBootstrapped } from "../state/entities";
import { useCustomerFace } from "./customerFace";
import { CustomerProjectCard } from "./CustomerProjectCard";
import { useFaceProjects } from "./useFaceData";

/** Every project the session can see: the customer's own, or for an operator everyone's. */
export function FaceProjectsPage() {
  const operator = useCustomerFace().face === "operator";
  const ready = useAllEnvironmentShellsBootstrapped();
  const { projects, attention } = useFaceProjects();
  const attentionByProject = new Map(
    attention.map(
      (item) => [`${item.projectRef.environmentId}\0${item.projectRef.projectId}`, item] as const,
    ),
  );
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-12 pt-10 pb-8">
      <h1 className="text-2xl font-bold">{operator ? <T>All projects</T> : <T>My projects</T>}</h1>
      {projects.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
          {projects.map((project) => {
            const kind = operator
              ? attentionByProject.get(
                  `${project.projectRef.environmentId}\0${project.projectRef.projectId}`,
                )?.kind
              : undefined;
            return (
              <CustomerProjectCard
                key={`${project.projectRef.environmentId}:${project.projectRef.projectId}`}
                project={project}
                showOwner={operator}
                attention={kind === undefined ? null : kind === "failed" ? "urgent" : "waiting"}
              />
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-muted-foreground">
          {ready ? <T>No projects yet.</T> : <T>Loading projects…</T>}
        </div>
      )}
    </main>
  );
}
