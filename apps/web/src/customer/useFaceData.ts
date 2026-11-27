import { useNowMinute } from "../hooks/useNowMinute";
import { useProjects, useVisibleThreadShells } from "../state/entities";
import { deriveAttention } from "./attention.logic";
import { deriveCustomerProjects } from "./customerProjects.logic";

/** The minute tick is a UTC timestamp cut to the minute, with no zone marker. */
export function useNowMs(): number {
  return Date.parse(`${useNowMinute()}:00Z`);
}

/**
 * The projects both faces list and what needs an operator. A member is sent only their own
 * threads, a manager everyone's, so the same derivation serves both.
 */
export function useFaceProjects() {
  const projects = useProjects();
  const threads = useVisibleThreadShells();
  const nowMs = useNowMs();
  return {
    projects: deriveCustomerProjects(projects, threads),
    attention: deriveAttention(projects, threads, nowMs),
    nowMs,
  };
}
