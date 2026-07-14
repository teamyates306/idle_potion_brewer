import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline support: the service worker precaches the sprite sheets and caches
// the app bundle + pixel font after first load, so the workshop art survives
// going offline. Production only — it would fight Vite's dev-server HMR.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline caching is best-effort */
    });
  });
}
