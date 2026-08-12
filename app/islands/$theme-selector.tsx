import desktopIcon from "@phosphor-icons/core/assets/regular/desktop.svg?raw";
import moonIcon from "@phosphor-icons/core/assets/regular/moon.svg?raw";
import sunIcon from "@phosphor-icons/core/assets/regular/sun.svg?raw";
import { useEffect, useState } from "hono/jsx";
import { PhosphorIcon } from "../components/phosphor-icon";

const THEME_STORAGE_KEY = "my-memo.theme";

type ThemePreference = "system" | "light" | "dark";

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

const applyTheme = (preference: ThemePreference) => {
  const root = document.documentElement;
  const colorScheme = document.querySelector<HTMLMetaElement>(
    'meta[name="color-scheme"]',
  );

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
};

const options: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  icon: string;
}> = [
  { value: "system", label: "システム", icon: desktopIcon },
  { value: "light", label: "ライト", icon: sunIcon },
  { value: "dark", label: "ダーク", icon: moonIcon },
];

export const ThemeSelector = () => {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const savedPreference = localStorage.getItem(THEME_STORAGE_KEY);
    setPreference(
      isThemePreference(savedPreference) ? savedPreference : "system",
    );
  }, []);

  const selectTheme = (nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    applyTheme(nextPreference);
    localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  };

  return (
    <fieldset className="w-full space-y-2">
      <legend className="px-2 text-sm">テーマ</legend>
      <div className="join flex w-full">
        {options.map((option) => (
          <label
            className={
              preference === option.value
                ? "join-item btn btn-primary btn-sm btn-soft flex-1"
                : "join-item btn btn-sm flex-1"
            }
            key={option.value}
            title={option.label}
          >
            <input
              aria-label={option.label}
              checked={preference === option.value}
              className="sr-only"
              name="theme"
              onChange={() => selectTheme(option.value)}
              type="radio"
              value={option.value}
            />
            <PhosphorIcon
              className="inline-flex shrink-0 [&_svg]:size-5"
              svg={option.icon}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
};
