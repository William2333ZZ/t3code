import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isListedThreadLineage,
  type ScopedProjectRef,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { useAllEnvironmentShellsBootstrapped, useVisibleThreadShells } from "../state/entities";
import { employeeWorkState } from "./companion.logic";
import { CustomerComposer } from "./CustomerComposer";
import { CustomerConversation } from "./CustomerConversation";
import { useCustomerFace } from "./customerFace";
import { CustomerPreviewPane } from "./CustomerPreviewPane";
import { CustomerProgressCard } from "./CustomerProgressCard";
import { customerStatus } from "./customerProjects.logic";
import { CustomerQuestionCard } from "./CustomerQuestionCard";
import { CustomerTeamStrip } from "./CustomerTeamStrip";
import { OperatorBackstage } from "./OperatorBackstage";
import { useFaceProjects, useNowMs } from "./useFaceData";
import { useCustomerThread } from "./useCustomerThread";

function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-card px-4 py-3 text-muted-foreground">{children}</div>;
}

/** The operator's switch between the customer's view of a project and the work behind it. */
function SideSwitch(props: { projectRef: ScopedProjectRef; threadId: string; backstage: boolean }) {
  const gt = useGT();
  const tab = (selected: boolean) =>
    cn(
      "rounded-lg px-3.5 py-1",
      selected ? "bg-card font-semibold shadow-(--customer-shadow-line)" : "text-muted-foreground",
    );
  return (
    <div
      role="tablist"
      aria-label={gt("Which side of the project to show")}
      className="flex rounded-xl bg-border/60 p-0.75"
    >
      <Link
        role="tab"
        aria-selected={!props.backstage}
        to="/c/$environmentId/$projectId"
        params={props.projectRef}
        search={{ thread: props.threadId }}
        className={tab(!props.backstage)}
      >
        <T>Customer sees</T>
      </Link>
      <Link
        role="tab"
        aria-selected={props.backstage}
        to="/c/$environmentId/$projectId"
        params={props.projectRef}
        search={{ view: "backstage", thread: props.threadId }}
        className={tab(props.backstage)}
      >
        <T context="the work behind what the customer sees">Behind the scenes</T>
      </Link>
    </div>
  );
}

function ThreadWorkspace(props: {
  title: string;
  projectRef: ScopedProjectRef;
  shell: EnvironmentThreadShell;
  threadRef: ScopedThreadRef;
  backstage: boolean;
}) {
  const { threadRef, shell } = props;
  const gt = useGT();
  const { face } = useCustomerFace();
  const operator = face === "operator";
  const backstage = operator && props.backstage;
  const thread = useCustomerThread(threadRef);
  const nowMs = useNowMs();
  // A turn stays open while it waits on the customer; that is their move, not the team working.
  const teamWorking =
    thread.isWorking && thread.pendingUserInput === null && !thread.hasPendingApproval;
  const employeeState =
    thread.pendingUserInput !== null || thread.hasPendingApproval
      ? "waiting"
      : teamWorking
        ? "working"
        : employeeWorkState(customerStatus(shell), shell.latestRun, nowMs);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5">
        <h1 className="truncate text-base font-semibold">{props.title}</h1>
        {operator && shell.owner !== null ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-(length:--customer-note) text-muted-foreground">
            <span className="flex size-5 items-center justify-center rounded-full bg-border text-xs font-semibold text-foreground">
              {[...shell.owner][0]?.toUpperCase()}
            </span>
            {shell.owner}
          </span>
        ) : null}
        <span className="flex-1" />
        {operator ? (
          <SideSwitch
            projectRef={props.projectRef}
            threadId={threadRef.threadId}
            backstage={backstage}
          />
        ) : null}
        <span className="flex-1" />
      </header>
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
        <section className="flex w-[430px] shrink-0 flex-col">
          {backstage ? (
            <div className="px-2 pt-2 text-(length:--customer-note) text-muted-foreground">
              {shell.owner === null
                ? gt("The conversation, as the customer sees it")
                : gt("The conversation, as {owner} sees it", { owner: shell.owner })}
            </div>
          ) : null}
          <CustomerConversation
            threadRef={threadRef}
            rows={thread.rows}
            showWorkingLine={teamWorking && thread.steps.length === 0}
            workStartedAt={thread.workStartedAt}
          >
            <CustomerProgressCard
              steps={thread.steps}
              working={teamWorking}
              startedAt={thread.workStartedAt}
            />
            {thread.pendingUserInput !== null ? (
              <CustomerQuestionCard
                key={thread.pendingUserInput.requestId}
                environmentId={threadRef.environmentId}
                threadId={threadRef.threadId}
                pendingUserInput={thread.pendingUserInput}
                answering={thread.answering}
                onSelectOption={thread.onSelectOption}
                onChangeCustomAnswer={thread.onChangeCustomAnswer}
                onAdvance={thread.onAdvanceQuestion}
              />
            ) : null}
            {thread.hasPendingApproval && !backstage ? (
              <Notice>
                {operator ? (
                  <T>The assistant is waiting for a permission. Answer it behind the scenes.</T>
                ) : (
                  <T>The assistant is waiting for a permission. Please ask your administrator.</T>
                )}
              </Notice>
            ) : null}
            {thread.error !== null ? (
              <div className="text-(length:--customer-note) text-error-foreground" role="alert">
                {thread.error}
              </div>
            ) : null}
            {teamWorking && !operator ? (
              <div className="text-(length:--customer-note) text-muted-foreground">
                <T>
                  You can close this window. The work carries on and will be here when you return.
                </T>
              </div>
            ) : null}
          </CustomerConversation>
          <div className="shrink-0 pb-1">
            <CustomerComposer
              onSend={thread.send}
              working={thread.isWorking}
              onStop={thread.interrupt}
              asFrontDesk={operator}
            />
          </div>
        </section>
        {backstage ? (
          <OperatorBackstage
            threadRef={threadRef}
            pendingApprovals={thread.pendingApprovals}
            respondingRequestIds={thread.respondingRequestIds}
            onRespondToApproval={thread.onRespondToApproval}
          />
        ) : (
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-(--customer-shadow-card)">
            <CustomerPreviewPane threadRef={threadRef} />
            <CustomerTeamStrip
              environmentId={threadRef.environmentId}
              working={teamWorking}
              state={employeeState}
              queuedCount={thread.queuedCount}
            />
          </main>
        )}
      </div>
    </div>
  );
}

/**
 * A project's screen: its conversation on the left, the live result on the right. An operator
 * can turn the right side over to the work behind it.
 */
export function CustomerWorkspace(props: {
  projectRef: ScopedProjectRef;
  backstage: boolean;
  /** A thread of the project to open instead of its latest. */
  threadId: string | null;
}) {
  const { projectRef } = props;
  const ready = useAllEnvironmentShellsBootstrapped();
  const threads = useVisibleThreadShells();
  // The same rule the home screen lists by, so a project opens on the thread its card showed.
  const project = useFaceProjects().projects.find(
    (entry) =>
      entry.projectRef.environmentId === projectRef.environmentId &&
      entry.projectRef.projectId === projectRef.projectId,
  );
  if (project !== undefined) {
    const requested =
      props.threadId === null
        ? undefined
        : threads.find(
            (shell) =>
              shell.environmentId === projectRef.environmentId &&
              shell.projectId === projectRef.projectId &&
              shell.id === props.threadId &&
              shell.archivedAt === null &&
              isListedThreadLineage(shell.lineage),
          );
    const shell = requested ?? project.latestThread;
    const threadRef = scopeThreadRef(shell.environmentId, shell.id);
    return (
      <ThreadWorkspace
        key={`${threadRef.environmentId}:${threadRef.threadId}`}
        title={project.title}
        projectRef={projectRef}
        shell={shell}
        threadRef={threadRef}
        backstage={props.backstage}
      />
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-muted-foreground">
      {ready ? (
        <>
          <T>This project isn't available here.</T>
          <Link to="/c" className="rounded-full bg-primary px-4 py-1.5 text-primary-foreground">
            <T>Back to my projects</T>
          </Link>
        </>
      ) : (
        <T>Opening your project…</T>
      )}
    </div>
  );
}
