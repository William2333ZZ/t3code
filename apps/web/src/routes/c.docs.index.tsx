import { createFileRoute } from "@tanstack/react-router";

import { CustomerDocsIndex } from "../customer/CustomerDocs";

export const Route = createFileRoute("/c/docs/")({
  component: CustomerDocsIndex,
});
