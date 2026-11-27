import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { CustomerFaceContext } from "../customer/customerFace";
import { canUseOperatorFace, type UiModeOverride } from "../customer/customerMode";
import { currentUiFace } from "../customer/customerRedirect";
import { CustomerShell } from "../customer/CustomerShell";
import { FaceSidebar } from "../customer/FaceSidebar";

// The root route reads and remembers `?ui=`; it is declared here so links can carry it.
function validateCustomerSearch(search: Record<string, unknown>): { ui?: UiModeOverride } {
  return search.ui === "simple" || search.ui === "ops" || search.ui === "full"
    ? { ui: search.ui }
    : {};
}

export const Route = createFileRoute("/c")({
  validateSearch: validateCustomerSearch,
  beforeLoad: ({ context, search }) => {
    // Both faces work on the primary environment, so they need that session.
    if (context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/pair", replace: true });
    }
    const identity = context.authGateState.identity;
    return {
      customerFace: {
        face: currentUiFace(identity, search),
        identity,
        canOperate: canUseOperatorFace(identity),
      },
    };
  },
  component: CustomerRouteLayout,
});

function CustomerRouteLayout() {
  const { customerFace } = Route.useRouteContext();
  return (
    <CustomerFaceContext value={customerFace}>
      <CustomerShell
        followBrowserLanguage={customerFace.identity?.manager === false}
        sidebar={<FaceSidebar />}
      >
        <Outlet />
      </CustomerShell>
    </CustomerFaceContext>
  );
}
