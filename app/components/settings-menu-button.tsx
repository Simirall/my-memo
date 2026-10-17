"use client";

import hamburgerIcon from "@phosphor-icons/core/assets/regular/hamburger.svg?raw";
import { useRouter } from "waku/router/client";
import { PhosphorIcon } from "./phosphor-icon";

export default function SettingsMenuButton() {
  const { path } = useRouter();
  if (!path.startsWith("/settings")) return null;

  return (
    <label
      aria-label="設定メニューを開く"
      className="btn btn-ghost btn-circle drawer-button lg:hidden"
      htmlFor="settings-drawer"
    >
      <PhosphorIcon
        className="inline-flex [&_svg]:size-6"
        svg={hamburgerIcon}
      />
    </label>
  );
}
