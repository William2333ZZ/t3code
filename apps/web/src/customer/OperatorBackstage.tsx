import type { LegendListRef } from "@legendapp/list/react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  deriveRunlessWorkStartedAt,
  deriveThreadActivityRun,
  deriveThreadStructureRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import type {
  ProviderApprovalDecision,
  RuntimeRequestId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { T } from "gt-react";
import { useRef } from "react";

import { MessagesTimeline } from "../components/chat/MessagesTimeline";
import { ScrollToEndButton } from "../components/chat/TimelineOverlays";
import { useTimelineFollow } from "../components/chat/useTimelineFollow";
import { useIncrementalTimelineEntries } from "../hooks/useIncrementalTimelineEntries";
import { SideThreadsOpenContext } from "../hooks/useSideThreadTrigger";
import { deriveActiveWorkStartedAt, derivePhase, type PendingApproval } from "../session-logic";
import { useQuietThreadProjection, useTimelineVisibleTurnItems } from "../state/entities";

const NO_TURN_DIFFS: ReadonlyArray<never> = [];
const NO_OPTIMISTIC_MESSAGES: ReadonlyArray<never> = [];
const ignore = () => {};

function BackstageTimeline(props: {
  threadRef: ScopedThreadRef;
  projection: NonNullable<ReturnType<typeof useQuietThreadProjection>>["projection"];
  pendingApprovals: ReadonlyArray<PendingApproval>;
  respondingRequestIds: ReadonlyArray<RuntimeRequestId>;
  onRespondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}) {
  const { threadRef, projection } = props;
  const threadKey = scopedThreadKey(threadRef);
  const listRef = useRef<LegendListRef | null>(null);
  const visibleTurnItems = useTimelineVisibleTurnItems(threadRef);
  const entries = useIncrementalTimelineEntries(threadKey, {
    visibleTurnItems,
    optimisticMessages: NO_OPTIMISTIC_MESSAGES,
    attempts: projection.attempts,
    nodes: projection.nodes,
    plans: projection.plans,
  });
  const activityRun = deriveThreadActivityRun(projection);
  const runtime = deriveThreadStructureRuntime(projection);
  const runlessWorkStartedAt = deriveRunlessWorkStartedAt(projection);
  const isWorking = derivePhase(runtime) === "running" || runlessWorkStartedAt !== null;
  const workStartedAt =
    deriveActiveWorkStartedAt(activityRun, runtime, null) ?? runlessWorkStartedAt;
  const runningRunId = runtime?.activeRunId ?? null;
  const follow = useTimelineFollow({
    legendListRef: listRef,
    composerTimelineInset: 0,
    routeThreadKey: threadKey,
    activeThreadKey: threadKey,
    isServerThread: false,
    serverProjection: null,
    threadStatus: "live",
    activeActivityRun: activityRun,
    activeRunningTurnId: runningRunId,
    timelineEntries: entries,
    timelineAnchorMessageId: null,
    setTimelineAnchor: ignore,
  });
  return (
    <div className="relative min-h-0 flex-1">
      <SideThreadsOpenContext value={false}>
        <MessagesTimeline
          listRef={listRef}
          timelineEntries={entries}
          isWorking={isWorking}
          activeTurnStartedAt={workStartedAt}
          latestRun={activityRun}
          runningRunId={runningRunId}
          turnDiffSummaries={NO_TURN_DIFFS}
          runs={projection.runs}
          routeThreadKey={threadKey}
          onOpenThread={ignore}
          supportsConversationRollback={false}
          onRevertToTurnCount={ignore}
          isRevertingCheckpoint={false}
          onImageExpand={ignore}
          pendingApprovals={props.pendingApprovals}
          respondingRequestIds={props.respondingRequestIds}
          canOperateThread
          onRespondToApproval={props.onRespondToApproval}
          activeThreadEnvironmentId={threadRef.environmentId}
          markdownCwd={undefined}
          resolvedTheme="light"
          timestampFormat="locale"
          workspaceRoot={undefined}
          anchorMessageId={null}
          onAnchorReady={ignore}
          onAnchorSizeChanged={ignore}
          contentInsetEndAdjustment={0}
          emptyPlaceholderInset={0}
          liveFollowEnabled={follow.timelineLiveFollowEnabled}
          onIsAtEndChange={follow.onIsAtEndChangeStable}
          onViewportAttach={follow.attachTimelineViewport}
          onFooterGrow={follow.onTimelineFooterGrowStable}
        />
      </SideThreadsOpenContext>
      {follow.showScrollToBottom ? (
        <ScrollToEndButton
          summary={null}
          bottom={4}
          onScrollToEnd={() => follow.scrollToEnd(true)}
        />
      ) : null}
    </div>
  );
}

/**
 * Behind the scenes of a project, for an operator: the thread's whole timeline as the developer
 * UI draws it, every tool call and command expandable, with approvals answerable in place.
 */
export function OperatorBackstage(props: {
  threadRef: ScopedThreadRef;
  pendingApprovals: ReadonlyArray<PendingApproval>;
  respondingRequestIds: ReadonlyArray<RuntimeRequestId>;
  onRespondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}) {
  const projection = useQuietThreadProjection(props.threadRef)?.projection ?? null;
  return (
    <main
      data-chat-canvas
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card py-2 shadow-(--customer-shadow-card) [--chat-lane-inset-end:0px] [--chat-lane-inset-start:0px] [--chat-timeline-gutter:0px]"
      data-testid="operator-backstage"
    >
      {projection === null ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <T>Opening the work…</T>
        </div>
      ) : (
        <BackstageTimeline {...props} projection={projection} />
      )}
    </main>
  );
}
