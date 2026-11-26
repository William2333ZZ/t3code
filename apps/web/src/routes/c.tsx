import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { CustomerShell } from "../customer/CustomerShell";

export const Route = createFileRoute("/c")({
  beforeLoad: ({ context }) => {
    // The customer UI works on the primary environment, so it needs that session.
    if (context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: CustomerRouteLayout,
});

function CustomerRouteLayout() {
  const { authGateState } = Route.useRouteContext();
  const member =
    authGateState.status === "authenticated" && authGateState.identity?.manager === false;
  return (
    <CustomerShell followBrowserLanguage={member}>
      <Outlet />
    </CustomerShell>
  );
}
