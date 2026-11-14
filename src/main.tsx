import { AfterCreditsProvider } from "./family/AfterCredits";
import { LegendProvider } from "./legend/Legend";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./family/family.css";
import "./design25.css";
import "./legend/trophies.css";
import { FamilyProvider } from "./family/FamilyProvider";
import { AuthBoundary } from "./family/AuthBoundary";
import { WelcomeGate } from "./family/Welcome";
import { PwaSafetyGate } from "./pwa/PwaSafetyGate";
import { startPwaUpdates } from "./pwa/lifecycle";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FamilyProvider>
      <PwaSafetyGate />
      <AuthBoundary>
        <WelcomeGate>
          <AfterCreditsProvider>
            <LegendProvider>
              <App />
            </LegendProvider>
          </AfterCreditsProvider>
        </WelcomeGate>
      </AuthBoundary>
    </FamilyProvider>
  </React.StrictMode>,
);
if (import.meta.env.PROD) startPwaUpdates(import.meta.env.BASE_URL);
