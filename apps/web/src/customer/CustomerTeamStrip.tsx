import type { EnvironmentId } from "@t3tools/contracts";
import { T, useGT } from "gt-react";

import { useEnvironment } from "../state/environments";
import { CustomerAvatar } from "./CustomerAvatar";

/**
 * Who is working for the customer. An environment names at most one employee; without one the
 * strip shows a single unnamed assistant rather than inventing a team.
 */
export function CustomerTeamStrip(props: {
  environmentId: EnvironmentId;
  working: boolean;
  queuedCount: number;
}) {
  const gt = useGT();
  const employee = useEnvironment(props.environmentId)?.serverConfig?.environment.employee;
  return (
    <div className="flex h-16 shrink-0 items-center gap-4.5 border-t border-muted px-4.5">
      <span className="text-(length:--customer-note) text-muted-foreground">
        <T>Your team</T>
      </span>
      <div className="flex min-w-0 items-center gap-2" data-testid="customer-team-member">
        <CustomerAvatar seed={employee?.id ?? "assistant"} size={26} />
        <div className="min-w-0">
          <div className="truncate text-(length:--customer-note)/4 font-medium">
            {employee?.name ?? gt("Assistant", { $context: "an AI assistant with no name" })}
            {employee?.title ? (
              <span className="font-normal text-muted-foreground"> · {employee.title}</span>
            ) : null}
          </div>
          <div
            className={props.working ? "text-xs/4 text-info" : "text-xs/4 text-muted-foreground"}
          >
            {props.working ? <T>Working on your project</T> : <T>Ready when you are</T>}
          </div>
        </div>
      </div>
      <span className="flex-1" />
      {props.queuedCount > 0 ? (
        <span className="rounded-xl bg-background px-3 py-0.75 text-(length:--customer-note) text-muted-foreground">
          {gt(
            "{count, plural, =1 {1 message of yours is waiting in line} other {{count} messages of yours are waiting in line}}",
            { count: props.queuedCount },
          )}
        </span>
      ) : null}
    </div>
  );
}
