import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./family/family.css";
import { FamilyProvider } from "./family/FamilyProvider";
import { AuthBoundary } from "./family/AuthBoundary";
import { WelcomeGate } from "./family/Welcome";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FamilyProvider>
      <AuthBoundary>
        <WelcomeGate>
          <App />
        </WelcomeGate>
      </AuthBoundary>
    </FamilyProvider>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => window.dispatchEvent(new Event("sw-error")));
  });
}
