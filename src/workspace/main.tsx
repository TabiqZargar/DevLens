import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/index.css";
import { WorkspaceApp } from "./WorkspaceApp";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Workspace root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>,
);
