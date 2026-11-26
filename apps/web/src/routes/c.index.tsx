import { createFileRoute } from "@tanstack/react-router";

import { CustomerHome } from "../customer/CustomerHome";

export const Route = createFileRoute("/c/")({
  component: CustomerHome,
});
