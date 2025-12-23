import { useRequestContext } from "hono/jsx-renderer";
import { LogoutButton } from "../islands/logout";

export const Header = () => {
  const c = useRequestContext();
  const user = c.get("user");

  return (
    <div className="navbar sticky top-0 z-10 bg-base-100 shadow-sm">
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
              // biome-ignore lint: daisyui
              tabIndex={0}
            >
              <div className="w-10 rounded-full">
                <img alt="User avatar" src={user.image} />
              </div>
            </div>
            <ul
              className="menu menu-sm dropdown-content z-1 mt-3 flex w-52 flex-col items-center rounded-box bg-base-100 p-2 shadow"
              tabIndex={-1}
            >
              <LogoutButton />
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
