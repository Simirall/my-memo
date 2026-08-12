(() => {
  let preference = "system";

  try {
    const savedPreference = localStorage.getItem("my-memo.theme");
    if (savedPreference === "light" || savedPreference === "dark") {
      preference = savedPreference;
    }
  } catch {
    // Keep the system theme when storage is unavailable.
  }

  const root = document.documentElement;
  const colorScheme = document.querySelector('meta[name="color-scheme"]');

  if (preference === "light") {
    root.dataset.theme = "autumn";
    colorScheme?.setAttribute("content", "light");
  } else if (preference === "dark") {
    root.dataset.theme = "dim";
    colorScheme?.setAttribute("content", "dark");
  } else {
    root.removeAttribute("data-theme");
    colorScheme?.setAttribute("content", "light dark");
  }
})();
