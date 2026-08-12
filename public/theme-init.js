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
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const darkMode = matchMedia("(prefers-color-scheme: dark)");

  const setThemeColor = (isDark) => {
    themeColor?.setAttribute("content", isDark ? "#20252e" : "#f7f3ed");
  };

  if (preference === "light") {
    root.dataset.theme = "autumn";
    colorScheme?.setAttribute("content", "light");
    setThemeColor(false);
  } else if (preference === "dark") {
    root.dataset.theme = "dim";
    colorScheme?.setAttribute("content", "dark");
    setThemeColor(true);
  } else {
    root.removeAttribute("data-theme");
    colorScheme?.setAttribute("content", "light dark");
    setThemeColor(darkMode.matches);
  }

  darkMode.addEventListener("change", (event) => {
    let savedPreference;
    try {
      savedPreference = localStorage.getItem("my-memo.theme");
    } catch {
      // Treat unavailable storage as the system preference.
    }
    if (savedPreference !== "light" && savedPreference !== "dark") {
      setThemeColor(event.matches);
    }
  });
})();
