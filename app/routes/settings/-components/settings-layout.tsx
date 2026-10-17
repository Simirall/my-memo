import type { ReactNode as Child } from "react";
import { SettingsNavigation } from "./settings-navigation";

export const SettingsLayout = ({ children }: { children: Child }) => {
  const drawerId = "settings-drawer";

  return (
    <div className="drawer lg:drawer-open h-full gap-4">
      <input className="drawer-toggle" id={drawerId} type="checkbox" />
      <div className="drawer-content min-w-0">
        <div className="mx-auto max-w-4xl">{children}</div>
      </div>
      <div className="drawer-side z-20 lg:h-auto">
        <label
          aria-label="設定メニューを閉じる"
          className="drawer-overlay"
          htmlFor={drawerId}
        />
        <aside className="h-full w-72 rounded-lg bg-base-200 p-4 lg:h-auto">
          <SettingsNavigation />
        </aside>
      </div>
    </div>
  );
};
