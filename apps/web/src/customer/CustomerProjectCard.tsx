import { Link } from "@tanstack/react-router";
import { T, useMessages } from "gt-react";

import { cn } from "../lib/utils";
import { useThreadDiscoveredPorts } from "../portDiscoveryState";
import { customerHue } from "./CustomerAvatar";
import { customerStatusLine, type CustomerProject } from "./customerProjects.logic";
import { useNowMs } from "./useFaceData";

const STATUS_TONE = {
  working: "text-info",
  "needs-answer": "text-warning-foreground",
  blocked: "text-warning-foreground",
  failed: "text-error-foreground",
  idle: "text-muted-foreground",
} as const;

/**
 * One project, the same card in both faces. The operator's also names whose project it is and
 * marks the ones that need them.
 */
export function CustomerProjectCard({
  project,
  showOwner = false,
  attention = null,
}: {
  project: CustomerProject;
  showOwner?: boolean;
  attention?: "urgent" | "waiting" | null;
}) {
  const messages = useMessages();
  const now = useNowMs();
  // There is no page thumbnail to show; the banner is decoration in the project's own colour.
  const [main, tint] = customerHue(project.projectRef.projectId);
  const hasPreview =
    useThreadDiscoveredPorts({
      environmentId: project.latestThread.environmentId,
      threadId: project.latestThread.id,
    }).length > 0;
  return (
    <Link
      to="/c/$environmentId/$projectId"
      params={project.projectRef}
      className="overflow-hidden rounded-2xl bg-card shadow-(--customer-shadow-line) transition-shadow hover:shadow-(--customer-shadow-card)"
      data-testid="customer-project-card"
    >
      <div
        aria-hidden="true"
        className="relative flex h-21 flex-col gap-1.5 p-3.5"
        style={{ backgroundColor: `color-mix(in srgb, ${tint} 45%, #fff)` }}
      >
        <span className="h-2.5 w-3/5 rounded-full" style={{ backgroundColor: main }} />
        <span className="h-2 w-[90%] rounded-full" style={{ backgroundColor: tint }} />
        <span className="h-2 w-3/4 rounded-full" style={{ backgroundColor: tint }} />
        {attention !== null ? (
          <span
            className={cn(
              "absolute top-2.5 right-2.5 size-2.25 rounded-full ring-3 ring-card",
              attention === "urgent" ? "bg-error" : "bg-warning",
            )}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{project.title}</div>
          {showOwner ? (
            <div className="truncate text-(length:--customer-note) text-muted-foreground">
              {project.latestThread.owner ?? <T>No owner</T>}
            </div>
          ) : null}
          <div
            className={cn("truncate text-(length:--customer-note)", STATUS_TONE[project.status])}
          >
            {customerStatusLine(project, now, messages)}
          </div>
        </div>
        {hasPreview ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-(length:--customer-note) text-warning-foreground">
            <span className="size-1.5 rounded-full bg-warning" />
            <T context="badge: an early version of the customer's page, not published yet">
              Trial version
            </T>
          </span>
        ) : null}
      </div>
    </Link>
  );
}
