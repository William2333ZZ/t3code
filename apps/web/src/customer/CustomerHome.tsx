import { useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { useState } from "react";

import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useVisibleThreadShells,
} from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useEnvironmentPersons } from "../state/session";
import { CustomerAvatar } from "./CustomerAvatar";
import { CustomerProjectCard } from "./CustomerProjectCard";
import { deriveCustomerProjects } from "./customerProjects.logic";
import { CustomerBrandName, CustomerHomeLink } from "./CustomerShell";
import { useCustomerStart } from "./useCustomerStart";

function PersonBadge() {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const persons = useEnvironmentPersons(
    primaryEnvironmentId === null ? [] : [primaryEnvironmentId],
  );
  const person = primaryEnvironmentId === null ? undefined : persons.get(primaryEnvironmentId);
  if (person === undefined) return null;
  return (
    <span
      aria-label={person}
      className="flex size-7 items-center justify-center rounded-full bg-border text-xs font-semibold"
    >
      {[...person][0]?.toUpperCase()}
    </span>
  );
}

/** The first screen: one box to say what to make, and the projects already under way. */
export function CustomerHome() {
  const gt = useGT();
  const navigate = useNavigate();
  const { start, starting, error } = useCustomerStart();
  const [prompt, setPrompt] = useState("");
  const ready = useAllEnvironmentShellsBootstrapped();
  const projects = deriveCustomerProjects(useProjects(), useVisibleThreadShells());
  const examples = [
    gt("An event sign-up page"),
    gt("A small expense-claim tool"),
    gt("A shift schedule for our shop"),
    gt("A customer registration form"),
    gt("A dashboard for our numbers"),
  ];
  const canStart = prompt.trim().length > 0 && !starting;

  const submit = () => {
    if (!canStart) return;
    void start(prompt).then((projectRef) => {
      if (projectRef === null) return;
      setPrompt("");
      void navigate({ to: "/c/$environmentId/$projectId", params: projectRef });
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-6">
        <CustomerHomeLink />
        <CustomerBrandName />
        <span className="flex-1" />
        <PersonBadge />
      </header>
      <main className="flex flex-col items-center gap-7 px-6 pt-14 pb-10">
        <div className="flex items-end gap-3.5">
          <CustomerAvatar seed="home-left" size={44} />
          <CustomerAvatar seed="home-centre" size={60} />
          <CustomerAvatar seed="home-right" size={44} />
        </div>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-4xl/11 font-bold tracking-tight">
            <T>What do you want to make?</T>
          </h1>
          <p className="text-base text-muted-foreground">
            <T>
              One sentence is enough. The team builds it, checks it, and shows you the result here.
            </T>
          </p>
        </div>
        <div className="flex w-[720px] max-w-full flex-col gap-7 rounded-2xl bg-card pt-5 pr-5 pb-3.5 pl-6 shadow-(--customer-shadow-raised)">
          <textarea
            value={prompt}
            rows={1}
            disabled={starting}
            aria-label={gt("What you want to make")}
            placeholder={gt(
              "For example: a shift schedule page for our shop, where the manager sets shifts and staff can see them",
            )}
            className="field-sizing-content max-h-48 w-full resize-none bg-transparent text-base outline-none placeholder:text-(--placeholder)"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              // Enter also confirms an input-method candidate; that one is not a send.
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
          />
          <div className="flex items-center gap-2">
            <span
              className="min-w-0 flex-1 text-(length:--customer-note) text-error-foreground"
              role="alert"
            >
              {error}
            </span>
            {starting ? (
              <span className="text-(length:--customer-note) text-muted-foreground">
                <T>Getting your team started…</T>
              </span>
            ) : null}
            <button
              type="button"
              aria-label={gt("Start", { $context: "button: start building what was described" })}
              disabled={!canStart}
              className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground disabled:cursor-default disabled:opacity-40"
              onClick={submit}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M8 12.5v-9M4 7.5l4-4 4 4" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              disabled={starting}
              className="cursor-pointer rounded-2xl border border-border bg-card px-3.5 py-1.25 hover:bg-muted"
              onClick={() => setPrompt(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <section className="mt-5 flex w-[960px] max-w-full flex-col gap-3">
          <h2 className="font-semibold">
            <T>My projects</T>
          </h2>
          {projects.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
              {projects.map((project) => (
                <CustomerProjectCard
                  key={`${project.projectRef.environmentId}:${project.projectRef.projectId}`}
                  project={project}
                />
              ))}
            </div>
          ) : (
            <div
              className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-muted-foreground"
              data-testid="customer-projects-empty"
            >
              {ready ? (
                <T>Nothing here yet. The first thing you ask for becomes your first project.</T>
              ) : (
                <T>Loading your projects…</T>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
