import gearIcon from "@phosphor-icons/core/assets/regular/gear.svg?raw";
import hamburgerIcon from "@phosphor-icons/core/assets/regular/hamburger.svg?raw";
import usersThreeIcon from "@phosphor-icons/core/assets/regular/users-three.svg?raw";
import { useRequestContext } from "hono/jsx-renderer";
import { LogoutButton } from "../islands/$logout";
import { ThemeSelector } from "../islands/$theme-selector";
import { PhosphorIcon } from "./phosphor-icon";

export const Header = () => {
  const c = useRequestContext();
  const user = c.get("user");
  const isSettingsPage = c.req.path.startsWith("/settings");
  const userRole = user ? (user as { role?: string }).role : undefined;

  return (
    <header className="navbar sticky top-0 z-20 bg-base-200 shadow-sm">
      {isSettingsPage && (
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
      )}
      <div className="flex-1">
        <a className="btn btn-ghost text-xl" href="/">
          My Memo
        </a>
      </div>
      <div className="flex-none">
        {user && (
          <div>
            <button
              aria-label="ユーザーメニューを開く"
              className="btn btn-ghost btn-circle avatar"
              popovertarget="user-menu"
              style="anchor-name: --user-menu-anchor"
              type="button"
            >
              <div className="w-10 rounded-full">
                {user.image ? (
                  <img alt={`${user.name}のアバター`} src={user.image} />
                ) : (
                  <span className="flex size-full items-center justify-center bg-base-300 font-bold">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
            </button>
            {/* HonoX wraps LogoutButton in honox-island. Make that wrapper full-width so mx-auto can center the button. */}
            <ul
              className="dropdown dropdown-end menu mt-3 w-52 flex-col items-stretch space-y-2 rounded-box bg-base-300 p-2 shadow-lg [&>honox-island]:flex [&>honox-island]:w-full [&>honox-island]:justify-center"
              id="user-menu"
              popover="auto"
              style="position-anchor: --user-menu-anchor"
              tabIndex={-1}
            >
              <li className="w-full">
                <a
                  className="flex min-h-12 w-full items-center justify-start gap-2 px-4 text-base"
                  href="/settings/account"
                >
                  <PhosphorIcon
                    className="inline-flex shrink-0 [&_svg]:size-5"
                    svg={gearIcon}
                  />
                  設定
                </a>
              </li>
              {userRole === "admin" && (
                <li className="w-full">
                  <a
                    className="flex min-h-12 w-full items-center justify-start gap-2 px-4 text-base"
                    href="/admin/users"
                  >
                    <PhosphorIcon
                      className="inline-flex shrink-0 [&_svg]:size-5"
                      svg={usersThreeIcon}
                    />
                    ユーザー管理
                  </a>
                </li>
              )}
              <ThemeSelector />
              <LogoutButton />
            </ul>
          </div>
        )}
      </div>
    </header>
  );
};
