import { T, useGT, useMessages } from "gt-react";

import { useNowSecond } from "../hooks/useNowSecond";
import { formatElapsedDurationLabel } from "../timestampFormat";
import { CustomerAvatar } from "./CustomerAvatar";
import type { CustomerProgressStep, CustomerStepState } from "./customerTimeline.logic";

function StepMark({ state }: { state: CustomerStepState }) {
  const gt = useGT();
  if (state === "done") {
    return (
      <svg
        role="img"
        aria-label={gt("Done", { $context: "this step of the work is finished" })}
        width="18"
        height="18"
        viewBox="0 0 16 16"
      >
        <circle cx="8" cy="8" r="7" className="fill-success" />
        <path
          d="M5 8.2l2 2 4-4.4"
          fill="none"
          className="stroke-primary-foreground"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  if (state === "active") {
    return (
      <svg
        role="img"
        aria-label={gt("In progress", { $context: "this step of the work is under way" })}
        width="18"
        height="18"
        viewBox="0 0 16 16"
      >
        <circle cx="8" cy="8" r="6" fill="none" className="stroke-border" strokeWidth="2" />
        <path
          d="M8 2a6 6 0 0 1 6 6"
          fill="none"
          className="stroke-info"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (state === "pending") {
    return (
      <span className="text-(length:--customer-note) text-muted-foreground">
        <T context="this step of the work has not started yet">Up next</T>
      </span>
    );
  }
  return (
    <span className="text-(length:--customer-note) text-muted-foreground">
      {state === "failed" ? (
        <T context="this step of the work failed">Didn't finish</T>
      ) : (
        <T context="this step of the work was stopped before it finished">Stopped</T>
      )}
    </span>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const messages = useMessages();
  const now = useNowSecond();
  return (
    <span className="text-(length:--customer-note) text-muted-foreground">
      {formatElapsedDurationLabel(startedAt, now, messages)}
    </span>
  );
}

/** All there is to say about a turn that delegated nothing: work is under way, and for how long. */
export function CustomerWorkingLine({ startedAt }: { startedAt: string | null }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground" data-testid="customer-working">
      <span className="size-1.5 rounded-full bg-info" />
      <T>Working on it</T>
      {startedAt !== null ? <Elapsed startedAt={startedAt} /> : null}
    </div>
  );
}

/** The tasks the team split this turn into, each with where it stands. */
export function CustomerProgressCard(props: {
  steps: ReadonlyArray<CustomerProgressStep>;
  working: boolean;
  startedAt: string | null;
}) {
  if (props.steps.length === 0) return null;
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl bg-card px-4 py-3.5 shadow-(--customer-shadow-card)"
      data-testid="customer-progress"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-semibold">
          {props.working ? <T>The team is on it</T> : <T>What the team did</T>}
        </span>
        {props.working && props.startedAt !== null ? <Elapsed startedAt={props.startedAt} /> : null}
      </div>
      {props.steps.map((step) => (
        <div key={step.id} className="flex items-center gap-2.5">
          <CustomerAvatar seed={step.id} size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{step.title}</div>
            {step.detail !== null || step.worker !== null ? (
              <div className="truncate text-(length:--customer-note) text-muted-foreground">
                {step.detail ?? step.worker}
              </div>
            ) : null}
          </div>
          <StepMark state={step.state} />
        </div>
      ))}
    </div>
  );
}
