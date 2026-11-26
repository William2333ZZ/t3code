import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { T } from "gt-react";
import type { ReactNode } from "react";

import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useVisibleThreadShells,
} from "../state/entities";
import { CustomerComposer } from "./CustomerComposer";
import { CustomerConversation } from "./CustomerConversation";
import { CustomerPreviewPane } from "./CustomerPreviewPane";
import { CustomerProgressCard } from "./CustomerProgressCard";
import { deriveCustomerProjects } from "./customerProjects.logic";
import { CustomerQuestionCard } from "./CustomerQuestionCard";
import { CustomerHomeLink } from "./CustomerShell";
import { CustomerTeamStrip } from "./CustomerTeamStrip";
import { useCustomerThread } from "./useCustomerThread";

function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-card px-4 py-3 text-muted-foreground">{children}</div>;
}

function ThreadWorkspace({ title, threadRef }: { title: string; threadRef: ScopedThreadRef }) {
  const thread = useCustomerThread(threadRef);
  // A turn stays open while it waits on the customer; that is their move, not the team working.
  const teamWorking =
    thread.isWorking && thread.pendingUserInput === null && !thread.hasPendingApproval;
  return (
    <div className="flex min-h-0 flex-1 gap-3 p-3">
      <section className="flex w-[430px] shrink-0 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2.5 px-2">
          <CustomerHomeLink />
          <h1 className="truncate text-base font-semibold">{title}</h1>
        </header>
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
          {thread.hasPendingApproval ? (
            <Notice>
              <T>The assistant is waiting for a permission. Please ask your administrator.</T>
            </Notice>
          ) : null}
          {thread.error !== null ? (
            <div className="text-(length:--customer-note) text-error-foreground" role="alert">
              {thread.error}
            </div>
          ) : null}
          {teamWorking ? (
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
          />
        </div>
      </section>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-(--customer-shadow-card)">
        <CustomerPreviewPane threadRef={threadRef} />
        <CustomerTeamStrip
          environmentId={threadRef.environmentId}
          working={teamWorking}
          queuedCount={thread.queuedCount}
        />
      </main>
    </div>
  );
}

/** A project's screen: its conversation on the left, the live result on the right. */
export function CustomerWorkspace({ projectRef }: { projectRef: ScopedProjectRef }) {
  const ready = useAllEnvironmentShellsBootstrapped();
  // The same rule the home screen lists by, so a project opens on the thread its card showed.
  const project = deriveCustomerProjects(useProjects(), useVisibleThreadShells()).find(
    (entry) =>
      entry.projectRef.environmentId === projectRef.environmentId &&
      entry.projectRef.projectId === projectRef.projectId,
  );
  if (project !== undefined) {
    const threadRef = scopeThreadRef(project.latestThread.environmentId, project.latestThread.id);
    return (
      <ThreadWorkspace
        key={`${threadRef.environmentId}:${threadRef.threadId}`}
        title={project.title}
        threadRef={threadRef}
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
