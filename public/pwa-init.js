window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__myMemoInstallPrompt = event;
  window.dispatchEvent(new Event("my-memo-install-ready"));
});

window.addEventListener("appinstalled", () => {
  window.__myMemoInstallPrompt = undefined;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js");
  });
}
