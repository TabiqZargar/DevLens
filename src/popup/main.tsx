import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/index.css";
import { PopupApp } from "./PopupApp";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Popup root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
