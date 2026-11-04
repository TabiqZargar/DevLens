import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles/index.css";
import { PanelApp } from "./PanelApp";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("DevTools panel root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <PanelApp />
  </StrictMode>,
);
