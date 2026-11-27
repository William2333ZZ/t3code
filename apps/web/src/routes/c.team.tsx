import { createFileRoute } from "@tanstack/react-router";

import { FaceTeamPage } from "../customer/FaceTeamPage";

export const Route = createFileRoute("/c/team")({
  component: FaceTeamPage,
});
