import { createFileRoute, redirect } from "@tanstack/react-router";

import { OperatorAttentionPage } from "../customer/OperatorHome";

export const Route = createFileRoute("/c/attention")({
  beforeLoad: ({ context }) => {
    if (context.customerFace.face !== "operator") throw redirect({ to: "/c", replace: true });
  },
  component: OperatorAttentionPage,
});
