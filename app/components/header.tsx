import { useRequestContext } from "hono/jsx-renderer";
import { LogoutButton } from "../islands/logout";

export const Header = () => {
  const c = useRequestContext();
  const user = c.get("user");
  const userRole = user ? (user as { role?: string }).role : undefined;

  return (
    <header className="navbar sticky top-0 z-10 bg-base-100 shadow-sm">
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
                <img alt="User avatar" src={user.image!} />
              </div>
            </div>
            <ul
              className="menu menu-sm dropdown-content z-1 mt-3 flex w-52 flex-col items-center space-y-2 rounded-box bg-base-100 p-2 shadow"
              tabIndex={-1}
            >
              <li className="font-bold text-lg">GitHub: {user.name}</li>
              <li>
                <a href="/account/plan">Account plan</a>
              </li>
              {userRole === "admin" && (
                <li>
                  <a href="/admin/users">User management</a>
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
