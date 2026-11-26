import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { deriveThreadTitleSeed } from "@t3tools/client-runtime/operations";
import {
  DEFAULT_RUNTIME_MODE,
  type EnvironmentId,
  type ModelSelection,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";
import { useGT } from "gt-react";
import { useState } from "react";

import { newMessageId, newThreadId } from "../lib/utils";
import { resolveProjectDefaultProviderModelSelection } from "../providerInstances";
import { waitForProject, waitForThreadShell } from "../state/entities";
import {
  readEnvironment,
  readEnvironmentProviders,
  usePrimaryEnvironmentId,
} from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { DEFAULT_INTERACTION_MODE } from "../types";

const PROJECT_NAME_MAX_LENGTH = 40;

function projectNameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n", 1)[0]!.trim();
  return [...firstLine].slice(0, PROJECT_NAME_MAX_LENGTH).join("");
}

/** The model a new thread starts with on this environment; a new project has no settings yet. */
function readDefaultModelSelection(environmentId: EnvironmentId): ModelSelection | null {
  const settings = readEnvironment(environmentId)?.serverConfig?.settings;
  if (!settings) return null;
  const providers = readEnvironmentProviders(environmentId) ?? [];
  return resolveNewThreadModelSelection({
    defaultSelection:
      resolveProjectSettings(settings, null).settings.defaultModelSelection ??
      resolveProjectDefaultProviderModelSelection(providers, settings, null),
    fallbackSelection: settings.fallbackModelSelection ?? null,
    providers,
    settings,
    projectId: null,
    now: Date.now(),
  }).selection;
}

/** Starts a project from one sentence: a new project, its first thread, and the first turn. */
export function useCustomerStart() {
  const gt = useGT();
  const environmentId = usePrimaryEnvironmentId();
  const createProject = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (prompt: string): Promise<ScopedProjectRef | null> => {
    const failed = gt("That didn't start. Please try again.");
    if (environmentId === null) {
      setError(failed);
      return null;
    }
    // Resolved before anything is created, so an environment with no model leaves nothing behind.
    const modelSelection = readDefaultModelSelection(environmentId);
    if (modelSelection === null) {
      setError(gt("The assistant isn't ready yet. Please ask your administrator."));
      return null;
    }
    const created = await createProject({
      environmentId,
      input: { name: projectNameFromPrompt(prompt) },
    });
    if (created._tag === "Failure") {
      setError(failed);
      return null;
    }
    const projectRef = scopeProjectRef(environmentId, created.value.projectId);
    const project = await waitForProject(projectRef);
    const settings = readEnvironment(environmentId)?.serverConfig?.settings;
    // Full access unless the environment says otherwise: nobody here can answer an approval.
    const runtimeMode =
      (settings ? resolveProjectSettings(settings, project.id, project).settings : null)
        ?.defaultRuntimeMode ?? DEFAULT_RUNTIME_MODE;
    const threadId = newThreadId();
    const title = deriveThreadTitleSeed({ text: prompt, attachments: [] });
    const createdAt = new Date().toISOString();
    const started = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: newMessageId(), role: "user", text: prompt, attachments: [] },
        modelSelection,
        titleSeed: title,
        runtimeMode,
        interactionMode: DEFAULT_INTERACTION_MODE,
        bootstrap: {
          createThread: {
            projectId: project.id,
            title,
            modelSelection,
            runtimeMode,
            interactionMode: DEFAULT_INTERACTION_MODE,
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      },
    });
    if (started._tag === "Failure") {
      setError(failed);
      return null;
    }
    // The workspace picks its thread from the shell list, so arrive once the thread is in it.
    await waitForThreadShell(scopeThreadRef(environmentId, threadId));
    return projectRef;
  };

  const start = (prompt: string): Promise<ScopedProjectRef | null> => {
    const text = prompt.trim();
    if (text.length === 0 || starting) return Promise.resolve(null);
    setStarting(true);
    setError(null);
    return run(text)
      .catch(() => {
        setError(gt("That didn't start. Please try again."));
        return null;
      })
      .finally(() => setStarting(false));
  };

  return { start, starting, error };
}
