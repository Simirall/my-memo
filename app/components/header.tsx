import gearIcon from "@phosphor-icons/core/assets/regular/gear.svg?raw";
import usersThreeIcon from "@phosphor-icons/core/assets/regular/users-three.svg?raw";
import { useRequestContext } from "hono/jsx-renderer";
import { LogoutButton } from "../islands/$logout";
import { PhosphorIcon } from "./phosphor-icon";

export const Header = () => {
  const c = useRequestContext();
  const user = c.get("user");
  const userRole = user ? (user as { role?: string }).role : undefined;

  return (
    <header className="navbar sticky top-0 z-20 bg-base-200 shadow-sm">
      <div className="flex-1">
        <a className="btn btn-ghost text-xl" href="/">
          My Memo
        </a>
      </div>
      <div className="flex-none">
        {user && (
          <div className="dropdown dropdown-end">
            <div
              className="btn btn-ghost btn-circle avatar"
              elements="button"
              // biome-ignore lint: daisyui requires tabIndex={0} on the trigger element for dropdown keyboard navigation
              tabIndex={0}
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
            </div>
            {/* HonoX wraps LogoutButton in honox-island. Make that wrapper full-width so mx-auto can center the button. */}
            <ul
              className="menu dropdown-content z-1 mt-3 flex w-52 flex-col items-stretch space-y-2 rounded-box bg-base-300 p-2 shadow-lg [&>honox-island]:flex [&>honox-island]:w-full [&>honox-island]:justify-center"
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
              <LogoutButton />
            </ul>
          </div>
        )}
      </div>
    </header>
  );
};
