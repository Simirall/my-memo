import creditCardIcon from "@phosphor-icons/core/assets/regular/credit-card.svg?raw";
import foldersIcon from "@phosphor-icons/core/assets/regular/folders.svg?raw";
import tagIcon from "@phosphor-icons/core/assets/regular/tag.svg?raw";
import userCircleIcon from "@phosphor-icons/core/assets/regular/user-circle.svg?raw";
import type { Child } from "hono/jsx";
import { PhosphorIcon } from "@/routes/-shared";

export type SettingsSection = "account" | "plan" | "categories" | "tags";

const settingsItems: ReadonlyArray<{
  href: string;
  icon: string;
  label: string;
  section: SettingsSection;
}> = [
  {
    href: "/settings/account",
    icon: userCircleIcon,
    label: "アカウント",
    section: "account",
  },
  {
    href: "/settings/plan",
    icon: creditCardIcon,
    label: "プラン",
    section: "plan",
  },
  {
    href: "/settings/categories",
    icon: foldersIcon,
    label: "カテゴリー",
    section: "categories",
  },
  {
    href: "/settings/tags",
    icon: tagIcon,
    label: "タグ",
    section: "tags",
  },
];

export const SettingsLayout = ({
  activeSection,
  children,
}: {
  activeSection: SettingsSection;
  children: Child;
}) => {
  const drawerId = "settings-drawer";

  return (
    <div className="drawer lg:drawer-open gap-4">
      <input className="drawer-toggle" id={drawerId} type="checkbox" />
      <div className="drawer-content min-w-0">
        <div className="mb-4 lg:hidden">
          <label
            aria-label="設定メニューを開く"
            className="btn drawer-button"
            htmlFor={drawerId}
          >
            設定メニュー
          </label>
        </div>
        <div className="mx-auto max-w-4xl">{children}</div>
      </div>
      <div className="drawer-side z-20">
        <label
          aria-label="設定メニューを閉じる"
          className="drawer-overlay"
          htmlFor={drawerId}
        />
        <aside className="min-h-full w-72 rounded-lg bg-base-200 p-4">
          <nav aria-label="設定">
            <h2 className="mb-3 px-4 font-bold text-lg">設定</h2>
            <ul className="menu w-full">
              {settingsItems.map((item) => {
                const isActive = item.section === activeSection;

                return (
                  <li className="w-full" key={item.section}>
                    <a
                      aria-current={isActive ? "page" : undefined}
                      className={`w-full justify-start gap-3 ${isActive ? "menu-active" : ""}`}
                      href={item.href}
                    >
                      <PhosphorIcon
                        className="inline-flex shrink-0 [&_svg]:size-5"
                        svg={item.icon}
                      />
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
};
