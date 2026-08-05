import { createClient } from "honox/client";

createClient();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__myMemoInstallPrompt = event as NonNullable<
    typeof window.__myMemoInstallPrompt
  >;
  window.dispatchEvent(new Event("my-memo-install-ready"));
});

window.addEventListener("appinstalled", () => {
  window.__myMemoInstallPrompt = undefined;
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js");
  });
}
