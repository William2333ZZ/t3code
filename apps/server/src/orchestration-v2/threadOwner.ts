import type { OrchestrationV2AppThread, OrchestrationV2ThreadOwner } from "@t3tools/contracts";

/** The thread as that owner's, or as no one's when there is none. */
export function ownedBy(
  thread: OrchestrationV2AppThread,
  owner: OrchestrationV2ThreadOwner | undefined,
): OrchestrationV2AppThread {
  const { owner: _owner, ...rest } = thread;
  return owner === undefined ? rest : { ...rest, owner };
}

/**
 * Why a session may not give a thread to `target`, or undefined when it may. A session with no
 * person runs the environment and may do anything. A person may hand on their own thread or
 * claim one that has no owner, but not take or reassign someone else's.
 */
export function ownerChangeRefusal(input: {
  readonly current: string | undefined;
  readonly requester: string | undefined;
  readonly target: string | null;
}): string | undefined {
  if (input.requester === undefined || input.current === input.requester) return undefined;
  if (input.current !== undefined) return `This thread belongs to ${input.current}.`;
  return input.target === input.requester
    ? undefined
    : "You can claim a thread with no owner for yourself, not for someone else.";
}
