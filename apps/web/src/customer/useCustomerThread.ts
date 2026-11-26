import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  deriveRunlessWorkStartedAt,
  deriveThreadActivityRun,
  deriveThreadStructureRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import { getUserQueuedThreadRuns } from "@t3tools/client-runtime/state/thread-workflows";
import type { RunId, ScopedThreadRef } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { useRef, useState } from "react";

import { planComposerTurn } from "../components/ChatView.logic";
import type { ChatComposerHandle } from "../components/chat/ChatComposer";
import { useIncrementalTimelineRows, useStableRows } from "../components/chat/useTimelineRows";
import { usePendingThreadRequests } from "../components/chat/usePendingThreadRequests";
import { useComposerDraftStore } from "../composerDraftStore";
import { useIncrementalTimelineEntries } from "../hooks/useIncrementalTimelineEntries";
import { newMessageId } from "../lib/utils";
import { deriveActiveWorkStartedAt, derivePhase } from "../session-logic";
import { useQuietThreadProjection, useTimelineVisibleTurnItems } from "../state/entities";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { DEFAULT_INTERACTION_MODE, type ChatMessage } from "../types";
import { deriveProgressSteps, toCustomerRows } from "./customerTimeline.logic";

const NO_TURN_DIFFS: ReadonlyArray<never> = [];
const NOTHING_EXPANDED: ReadonlySet<RunId> = new Set();
const NO_STEPS: ReturnType<typeof deriveProgressSteps> = [];

/**
 * One thread as the customer UI needs it: the conversation rows, whether the team is working,
 * the open question, and sending. The rows come from the developer timeline's own derivation
 * with nothing expanded, so both UIs fold a thread the same way.
 */
export function useCustomerThread(threadRef: ScopedThreadRef) {
  const gt = useGT();
  const { environmentId, threadId } = threadRef;
  const threadKey = scopedThreadKey(threadRef);
  const projection = useQuietThreadProjection(threadRef)?.projection ?? null;
  const visibleTurnItems = useTimelineVisibleTurnItems(threadRef);
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const interruptTurn = useOrchestrationCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  const [optimistic, setOptimistic] = useState<ReadonlyArray<ChatMessage>>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Held only until the server's copy of the message is in the thread.
  const pendingMessages =
    projection === null
      ? optimistic
      : optimistic.filter((message) => !projection.messages.some((sent) => sent.id === message.id));
  const settled = pendingMessages.length !== optimistic.length;
  if (settled) setOptimistic(pendingMessages);
  // Same array while nothing settles: the timeline derivation compares its inputs by identity.
  const shownOptimistic = settled ? pendingMessages : optimistic;

  const entries = useIncrementalTimelineEntries(threadKey, {
    visibleTurnItems,
    optimisticMessages: shownOptimistic,
    ...(projection === null
      ? {}
      : { attempts: projection.attempts, nodes: projection.nodes, plans: projection.plans }),
  });
  const activityRun = projection === null ? null : deriveThreadActivityRun(projection);
  const runtime = projection === null ? null : deriveThreadStructureRuntime(projection);
  const runlessWorkStartedAt = projection === null ? null : deriveRunlessWorkStartedAt(projection);
  const phase = derivePhase(runtime);
  const isWorking =
    phase === "connecting" || phase === "running" || sending || runlessWorkStartedAt !== null;
  const workStartedAt =
    deriveActiveWorkStartedAt(activityRun, runtime, null) ?? runlessWorkStartedAt;
  const timelineRows = useStableRows(
    useIncrementalTimelineRows(threadKey, {
      timelineEntries: entries,
      latestRun: activityRun,
      runningRunId: runtime?.activeRunId ?? null,
      isWorking,
      activeTurnStartedAt: workStartedAt,
      turnDiffSummaries: NO_TURN_DIFFS,
      supportsConversationRollback: false,
      expandedRunIds: NOTHING_EXPANDED,
    }),
    threadKey,
  );

  // The question hook writes a displaced typed answer into the developer composer's draft. The
  // customer composer keeps no draft there, so that branch never has text to move.
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const promptRef = useRef("");
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const requests = usePendingThreadRequests({
    environmentId,
    activeThreadId: threadId,
    serverProjection: projection,
    supportsQuestionAttachments: false,
    composerDraftTarget: threadRef,
    setComposerDraftPrompt,
    promptRef,
    composerRef,
    setThreadError: (_threadId, message) => setError(message),
  });

  const send = async (text: string): Promise<boolean> => {
    const messageText = text.trim();
    if (messageText.length === 0 || projection === null) return false;
    const plan = planComposerTurn({
      messageText,
      sendQueuesBehindSetup: false,
      isServerThread: true,
      activeMessageCount: projection.messages.length,
      sendEnvMode: "local",
      worktreePath: null,
      activeThreadBranch: projection.thread.branch,
      projectIsGitRepo: true,
      isScratchProject: false,
      resumeCompactionTokens: null,
      keepFullHistory: false,
      phase,
      // A customer never steers: what they add while the team works waits its turn.
      dispatchMode: phase === "running" ? "queue" : "auto",
      freshContext: false,
    });
    const messageId = newMessageId();
    const createdAt = new Date().toISOString();
    const message: ChatMessage = {
      id: messageId,
      role: "user",
      text: messageText,
      runId: null,
      streaming: false,
      createdAt,
      updatedAt: createdAt,
      ...(plan.shouldQueueBehindActiveRun ? { inputIntent: "queued_turn" as const } : {}),
    };
    setOptimistic([...pendingMessages, message]);
    setSending(true);
    setError(null);
    const result = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId, role: "user", text: messageText, attachments: [] },
        runtimeMode: projection.thread.runtimeMode,
        interactionMode: DEFAULT_INTERACTION_MODE,
        dispatchMode: plan.turnDispatchMode,
        createdAt,
      },
    });
    setSending(false);
    if (result._tag === "Failure") {
      setOptimistic((current) => current.filter((entry) => entry.id !== messageId));
      setError(gt("That didn't send. Please try again."));
      return false;
    }
    return true;
  };

  const interrupt = () => void interruptTurn({ environmentId, input: { threadId } });

  return {
    loaded: projection !== null,
    rows: toCustomerRows(timelineRows),
    steps: projection === null ? NO_STEPS : deriveProgressSteps(projection),
    isWorking,
    workStartedAt,
    queuedCount: projection === null ? 0 : getUserQueuedThreadRuns(projection).length,
    pendingUserInput: requests.activePendingUserInput,
    answering: requests.activePendingIsResponding,
    hasPendingApproval: requests.pendingApprovals.length > 0,
    onSelectOption: requests.onSelectActivePendingUserInputOption,
    onChangeCustomAnswer: requests.onChangeActivePendingUserInputCustomAnswer,
    onAdvanceQuestion: requests.onAdvanceActivePendingUserInput,
    error,
    send,
    interrupt,
  };
}
