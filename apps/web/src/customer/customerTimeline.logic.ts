import { projectedSubagentsToRuntime } from "@t3tools/client-runtime/state/subagentRuntime";
import { deriveThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";

import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";

export type CustomerRow =
  | { readonly kind: "user"; readonly id: string; readonly text: string; readonly queued: boolean }
  | {
      readonly kind: "assistant";
      readonly id: string;
      readonly text: string;
      readonly streaming: boolean;
      /** The turn item to read the live text from while it streams. */
      readonly itemId: string | undefined;
    }
  | { readonly kind: "summary"; readonly id: string; readonly label: string }
  | { readonly kind: "working"; readonly id: string };

/**
 * What a customer reads of a thread: what they said, what the assistant said, one line per
 * finished stretch of work, and one sign that work is under way. Tool calls, plans, events and
 * every other row of the developer timeline are dropped.
 */
export function toCustomerRows(rows: ReadonlyArray<MessagesTimelineRow>): CustomerRow[] {
  const result: CustomerRow[] = [];
  let working: CustomerRow | null = null;
  for (const row of rows) {
    switch (row.kind) {
      case "message": {
        const { message } = row;
        if (message.role === "user") {
          result.push({
            kind: "user",
            id: row.id,
            text: message.text,
            queued: message.inputIntent === "queued_turn",
          });
        } else if (message.role === "assistant" && (message.streaming || message.text !== "")) {
          result.push({
            kind: "assistant",
            id: row.id,
            text: message.text,
            streaming: message.streaming,
            itemId: row.projectedItem?.item.id,
          });
        }
        break;
      }
      case "turn-fold":
        result.push({ kind: "summary", id: row.id, label: row.label });
        break;
      case "working":
      case "thinking":
      case "work-live":
        working ??= { kind: "working", id: "working" };
        break;
      default:
        break;
    }
  }
  if (working !== null) result.push(working);
  return result;
}

export type CustomerStepState = "pending" | "active" | "done" | "failed" | "stopped";

export interface CustomerProgressStep {
  readonly id: string;
  readonly title: string;
  /** The task's own latest progress note, when it reported one. */
  readonly detail: string | null;
  /** Where a task handed to a linked environment runs. Nothing else names who does a step. */
  readonly worker: string | null;
  readonly state: CustomerStepState;
}

function stepState(status: OrchestrationV2ThreadProjection["subagents"][number]["status"]) {
  switch (status) {
    case "pending":
      return "pending";
    case "running":
    case "waiting":
      return "active";
    case "completed":
    case "idle":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
    case "interrupted":
      return "stopped";
  }
}

/** The current turn's delegated tasks as progress steps, in the order they started. */
export function deriveProgressSteps(
  projection: Pick<OrchestrationV2ThreadProjection, "runs" | "subagents">,
): ReadonlyArray<CustomerProgressStep> {
  const turn = deriveThreadTurnSubagents(projection);
  if (turn === null) return [];
  const workerById = new Map(
    turn.subagents.map((subagent) => [subagent.id as string, subagent.remoteChild?.label ?? null]),
  );
  const runtime = projectedSubagentsToRuntime(turn.subagents);
  // A workflow lists its agents as their own entries; the coordinator would repeat them.
  const coordinators = new Set(runtime.map((entry) => entry.parentAgentId));
  return runtime
    .filter((entry) => !coordinators.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      detail: entry.progress,
      worker: workerById.get(entry.id) ?? null,
      state: stepState(entry.status),
    }));
}
