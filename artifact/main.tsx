import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "../app/globals.css";
import { installArtifactStore } from "./artifact-store";
import Page from "../app/page";

// Claude artifact build: the page keeps calling /api/project-data;
// installArtifactStore() answers those calls from the artifact's db.
installArtifactStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
