"use client";

import creditCardIcon from "@phosphor-icons/core/assets/regular/credit-card.svg?raw";
import fileIcon from "@phosphor-icons/core/assets/regular/file.svg?raw";
import foldersIcon from "@phosphor-icons/core/assets/regular/folders.svg?raw";
import tagIcon from "@phosphor-icons/core/assets/regular/tag.svg?raw";
import userCircleIcon from "@phosphor-icons/core/assets/regular/user-circle.svg?raw";
import type { MouseEvent } from "react";
import { useRouter } from "waku/router/client";
import { AppLink } from "@/components/app-link";
import { PhosphorIcon } from "@/components/phosphor-icon";

export type SettingsSection =
  | "account"
  | "plan"
  | "categories"
  | "tags"
  | "files";

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
  {
    href: "/settings/files",
    icon: fileIcon,
    label: "ファイル",
    section: "files",
  },
];

const getActiveSection = (path: string) =>
  settingsItems.find(
    (item) => path === item.href || path.startsWith(`${item.href}/`),
  )?.section;

const closeDrawerOnNavigate = (event: MouseEvent<HTMLAnchorElement>) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const drawer = document.getElementById("settings-drawer");
  if (drawer instanceof HTMLInputElement) {
    drawer.checked = false;
  }
};

export function SettingsNavigation() {
  const { path } = useRouter();
  const activeSection = getActiveSection(path);

  return (
    <nav aria-label="設定">
      <h2 className="mb-3 px-4 text-lg font-bold">設定</h2>
      <ul className="menu w-full">
        {settingsItems.map((item) => {
          const isActive = item.section === activeSection;

          return (
            <li className="w-full" key={item.section}>
              <AppLink
                aria-current={isActive ? "page" : undefined}
                className={`w-full justify-start gap-3 ${isActive ? "menu-active" : ""}`}
                href={item.href}
                onClick={closeDrawerOnNavigate}
              >
                <PhosphorIcon
                  className="inline-flex shrink-0 [&_svg]:size-5"
                  svg={item.icon}
                />
                {item.label}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
