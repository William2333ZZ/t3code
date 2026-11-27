import { createContext, use } from "react";

import type { UiIdentity } from "./customerMode";
import type { UiFace } from "./faceSidebar.logic";

export interface CustomerFace {
  readonly face: UiFace;
  /** Absent for the environment's own sessions. */
  readonly identity: UiIdentity | undefined;
  /** Whether the session may switch to the operator face; it can always preview the customer's. */
  readonly canOperate: boolean;
}

export const CustomerFaceContext = createContext<CustomerFace>({
  face: "customer",
  identity: undefined,
  canOperate: false,
});

export function useCustomerFace(): CustomerFace {
  return use(CustomerFaceContext);
}
