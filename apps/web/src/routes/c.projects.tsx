import { createFileRoute } from "@tanstack/react-router";

import { FaceProjectsPage } from "../customer/FaceProjectsPage";

export const Route = createFileRoute("/c/projects")({
  component: FaceProjectsPage,
});
