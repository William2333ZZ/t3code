import { Link, useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { useState } from "react";

import { useAllEnvironmentShellsBootstrapped } from "../state/entities";
import { useEnvironment, usePrimaryEnvironmentId } from "../state/environments";
import { Companion } from "./Companion";
import { CustomerAvatar } from "./CustomerAvatar";
import { CustomerProjectCard } from "./CustomerProjectCard";
import { useFaceProjects } from "./useFaceData";
import { useCustomerStart } from "./useCustomerStart";

const HOME_PROJECT_COUNT = 6;

/** The employee of the environment new projects start on, if it names one. */
export function usePrimaryEmployee() {
  return useEnvironment(usePrimaryEnvironmentId())?.serverConfig?.environment.employee;
}

/**
 * The big box both faces start work from: a new project, its first thread and turn, then the
 * project's workspace.
 */
export function StartBox(props: {
  placeholder: string;
  prompt: string;
  onPrompt: (text: string) => void;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const { start, starting, error } = useCustomerStart();
  const { prompt, onPrompt } = props;
  const canStart = prompt.trim().length > 0 && !starting;

  const submit = () => {
    if (!canStart) return;
    void start(prompt).then((projectRef) => {
      if (projectRef === null) return;
      onPrompt("");
      void navigate({ to: "/c/$environmentId/$projectId", params: projectRef });
    });
  };

  return (
    <div className="flex w-full flex-col gap-6.5 rounded-3xl bg-card pt-4.5 pr-4.5 pb-3 pl-5.5 shadow-(--customer-shadow-raised)">
      <textarea
        value={prompt}
        rows={1}
        disabled={starting}
        aria-label={gt("What you want to make")}
        placeholder={props.placeholder}
        className="field-sizing-content max-h-48 w-full resize-none bg-transparent text-base outline-none placeholder:text-(--placeholder)"
        onChange={(event) => onPrompt(event.target.value)}
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
          className="flex size-8.5 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground disabled:cursor-default disabled:opacity-40"
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
  );
}

/** The team at the top of a home screen: the employee's companion, or three robots. */
export function HomeCrew(props: { size: number }) {
  const gt = useGT();
  const employee = usePrimaryEmployee();
  if (employee?.companion !== undefined) {
    return (
      <Companion
        employee={employee}
        animation="waving"
        size={props.size}
        seed={employee.id}
        label={gt("{name} waves hello", { name: employee.name })}
      />
    );
  }
  const side = Math.round(props.size * 0.72);
  return (
    <div className="flex items-end gap-3.5">
      <CustomerAvatar seed="home-left" size={side} />
      <CustomerAvatar seed={employee?.id ?? "home-centre"} size={props.size} />
      <CustomerAvatar seed="home-right" size={side} />
    </div>
  );
}

/** The first screen: one box to say what to make, and the projects already under way. */
export function CustomerHome() {
  const gt = useGT();
  const [prompt, setPrompt] = useState("");
  const ready = useAllEnvironmentShellsBootstrapped();
  const { projects } = useFaceProjects();
  const examples = [
    gt("An event sign-up page"),
    gt("A small expense-claim tool"),
    gt("A shift schedule for our shop"),
    gt("A customer registration form"),
    gt("A dashboard for our numbers"),
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center gap-6.5 overflow-y-auto scrollbar-gutter-both px-10 pt-16 pb-8">
      <HomeCrew size={64} />
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-4xl/11 font-bold tracking-tight">
          <T>What do you want to make?</T>
        </h1>
        <p className="text-base text-muted-foreground">
          <T>
            One sentence is enough. The team builds it, checks it, and shows you the result here.
          </T>
        </p>
      </div>
      <div className="w-[760px] max-w-full">
        <StartBox
          prompt={prompt}
          onPrompt={setPrompt}
          placeholder={gt(
            "For example: a shift schedule page for our shop, where the manager sets shifts and staff can see them",
          )}
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            className="cursor-pointer rounded-2xl border border-border bg-card px-3.5 py-1 hover:bg-muted"
            onClick={() => setPrompt(example)}
          >
            {example}
          </button>
        ))}
      </div>
      <section className="mt-2.5 flex w-[960px] max-w-full flex-col gap-3">
        <div className="flex items-center">
          <h2 className="text-base font-semibold">
            <T>My projects</T>
          </h2>
          <span className="flex-1" />
          {projects.length > HOME_PROJECT_COUNT ? (
            <Link to="/c/projects" className="text-(length:--customer-note) text-muted-foreground">
              {gt("All {count} ›", { count: projects.length })}
            </Link>
          ) : null}
        </div>
        {projects.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
            {projects.slice(0, HOME_PROJECT_COUNT).map((project) => (
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
  );
}
