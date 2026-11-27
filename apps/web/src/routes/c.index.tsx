import { createFileRoute } from "@tanstack/react-router";

import { CustomerHome } from "../customer/CustomerHome";
import { useCustomerFace } from "../customer/customerFace";
import { OperatorHome } from "../customer/OperatorHome";

export const Route = createFileRoute("/c/")({
  component: FaceHome,
});

function FaceHome() {
  return useCustomerFace().face === "operator" ? <OperatorHome /> : <CustomerHome />;
}
