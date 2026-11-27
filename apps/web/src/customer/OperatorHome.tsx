import { Link } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import { useState } from "react";

import { cn } from "../lib/utils";
import { useAllEnvironmentShellsBootstrapped } from "../state/entities";
import { formatElapsedDurationLabel } from "../timestampFormat";
import {
  operatorHeadline,
  summarizeOperatorDesk,
  type AttentionItem,
  type AttentionKind,
  mostUrgentByProject,
} from "./attention.logic";
import { Companion } from "./Companion";
import type { CompanionAnimation } from "./companion.logic";
import { HomeCrew, StartBox, usePrimaryEmployee } from "./CustomerHome";
import { CustomerProjectCard } from "./CustomerProjectCard";
import { needsYou } from "./opsOverview.logic";
import { NeedsYouList, OpsConnectCard, OpsHome } from "./OpsPanels";
import { useOpsOverview } from "./opsSource";
import { useFaceProjects } from "./useFaceData";

const HOME_ATTENTION_COUNT = 6;
const HOME_PROJECT_COUNT = 8;

const KIND_ANIMATION: Record<AttentionKind, CompanionAnimation> = {
  failed: "failed",
  limited: "failed",
  approval: "waiting",
  input: "waiting",
  "long-work": "running",
};

function firstLine(text: string): string {
  return text.split("\n", 1)[0]!.trim();
}

function AttentionCard({ item, nowMs }: { item: AttentionItem; nowMs: number }) {
  const gt = useGT();
  const messages = useMessages();
  const employee = usePrimaryEmployee();
  const { thread } = item;
  const urgent = item.kind === "failed";
  const badge = {
    failed: gt("Stuck", { $context: "badge: the work failed and needs a person" }),
    limited: gt("Out of quota", { $context: "badge: the assistant hit a usage limit" }),
    approval: gt("Needs your OK", { $context: "badge: the assistant waits for a permission" }),
    input: gt("Waiting on an answer", { $context: "badge: the assistant asked a question" }),
    "long-work": gt("Taking long", { $context: "badge: work has run for a long time" }),
  }[item.kind];
  const owner = thread.owner;
  const detail = {
    failed:
      thread.runtime?.lastError !== null && thread.runtime?.lastError !== undefined
        ? firstLine(thread.runtime.lastError)
        : gt("The last run failed"),
    limited: gt("The assistant hit a usage limit"),
    approval: gt("The assistant is waiting for a permission"),
    input:
      owner === null
        ? gt("The assistant asked a question")
        : gt("The assistant asked {owner} a question", { owner }),
    "long-work":
      item.since === null
        ? gt("Still working")
        : gt("Working for {duration}", {
            duration: formatElapsedDurationLabel(item.since, nowMs, messages),
          }),
  }[item.kind];
  return (
    <div
      className="flex flex-col gap-2.5 rounded-2xl bg-card p-4 shadow-(--customer-shadow-line)"
      data-testid="operator-attention-card"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-lg px-2 text-xs/5 font-semibold",
            urgent ? "bg-error/10 text-error-foreground" : "bg-warning/15 text-warning-foreground",
          )}
        >
          {badge}
        </span>
        {item.since !== null && item.kind !== "long-work" ? (
          <span className="text-(length:--customer-note) text-muted-foreground">
            {formatElapsedDurationLabel(item.since, nowMs, messages)}
          </span>
        ) : null}
      </div>
      <div className="line-clamp-2 text-base/5.5 font-semibold">
        {item.projectTitle}
        {thread.title !== "" && thread.title !== item.projectTitle ? `: ${thread.title}` : ""}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-(length:--customer-note) text-muted-foreground">
        <Companion
          employee={employee}
          animation={KIND_ANIMATION[item.kind]}
          size={28}
          seed={employee?.id ?? thread.id}
        />
        <span className="min-w-0 flex-1 truncate">{detail}</span>
      </div>
      <div className="mt-0.5 flex gap-2">
        <Link
          to="/c/$environmentId/$projectId"
          params={item.projectRef}
          search={{ view: "backstage", thread: thread.id }}
          className="rounded-lg bg-primary px-3.5 py-1.25 font-medium text-primary-foreground"
        >
          <T context="button: open the project behind the scenes">Take a look</T>
        </Link>
      </div>
    </div>
  );
}

function AttentionGrid(props: { items: ReadonlyArray<AttentionItem>; nowMs: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
      {props.items.map((item) => (
        <AttentionCard
          key={`${item.thread.environmentId}:${item.thread.id}`}
          item={item}
          nowMs={props.nowMs}
        />
      ))}
    </div>
  );
}

/** The operator's first screen: from the connected service when there is one, else from this app's threads. */
export function OperatorHome() {
  const ops = useOpsOverview();
  return ops.status === "ready" || ops.status === "lost" ? (
    <OpsHome state={ops} />
  ) : (
    <LocalOperatorHome />
  );
}

function LocalOperatorHome() {
  const gt = useGT();
  const messages = useMessages();
  const ready = useAllEnvironmentShellsBootstrapped();
  const { projects, attention, nowMs } = useFaceProjects();
  const [prompt, setPrompt] = useState("");
  const summary = summarizeOperatorDesk(projects, attention);
  const attentionByProject = mostUrgentByProject(attention);
  const idle = projects.filter((project) => project.status === "idle").length;

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-12 pt-10 pb-8">
      <OpsConnectCard />
      <div className="flex items-center gap-4">
        <HomeCrew size={52} />
        <div>
          <h1 className="text-3xl/9.5 font-bold tracking-tight" data-testid="operator-headline">
            {ready
              ? operatorHeadline(summary, new Date(nowMs).getHours(), messages)
              : gt("Looking at how things stand…")}
          </h1>
          {ready ? (
            <div className="text-muted-foreground">
              {gt(
                "{total, plural, =1 {1 project} other {{total} projects}} · {moving} moving · {idle} resting",
                { total: summary.total, moving: summary.moving, idle },
              )}
            </div>
          ) : null}
        </div>
      </div>
      <StartBox
        prompt={prompt}
        onPrompt={setPrompt}
        placeholder={gt(
          "Ask your assistant, or start a project. For example: why does the sign-up page keep failing?",
        )}
      />
      {attention.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold">
              <T>Needs you</T>
            </h2>
            <span className="text-(length:--customer-note) text-muted-foreground">
              <T>Most urgent first</T>
            </span>
            <span className="flex-1" />
            {attention.length > HOME_ATTENTION_COUNT ? (
              <Link
                to="/c/attention"
                className="text-(length:--customer-note) text-muted-foreground"
              >
                {gt("All {count} ›", { count: attention.length })}
              </Link>
            ) : null}
          </div>
          <AttentionGrid items={attention.slice(0, HOME_ATTENTION_COUNT)} nowMs={nowMs} />
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <div className="flex items-center">
          <h2 className="text-base font-semibold">
            <T>All projects</T>
          </h2>
          <span className="flex-1" />
          {projects.length > HOME_PROJECT_COUNT ? (
            <Link to="/c/projects" className="text-(length:--customer-note) text-muted-foreground">
              {gt("All {count} ›", { count: projects.length })}
            </Link>
          ) : null}
        </div>
        {projects.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {projects.slice(0, HOME_PROJECT_COUNT).map((project) => {
              const kind = attentionByProject.get(
                `${project.projectRef.environmentId}\0${project.projectRef.projectId}`,
              )?.kind;
              return (
                <CustomerProjectCard
                  key={`${project.projectRef.environmentId}:${project.projectRef.projectId}`}
                  project={project}
                  showOwner
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
      </section>
    </main>
  );
}

/** Everything that needs an operator, not only the first few the home screen shows. */
export function OperatorAttentionPage() {
  const ready = useAllEnvironmentShellsBootstrapped();
  const { attention, nowMs } = useFaceProjects();
  const ops = useOpsOverview();
  const overview = ops.status === "ready" || ops.status === "lost" ? ops.overview : null;
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-12 pt-10 pb-8">
      <h1 className="text-2xl font-bold">
        <T>Needs you</T>
      </h1>
      {overview !== null ? (
        <NeedsYouList items={needsYou(overview)} />
      ) : attention.length > 0 ? (
        <AttentionGrid items={attention} nowMs={nowMs} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-muted-foreground">
          {ready ? <T>Nothing needs you right now.</T> : <T>Looking at how things stand…</T>}
        </div>
      )}
    </main>
  );
}
