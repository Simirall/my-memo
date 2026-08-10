import { asc, eq } from "drizzle-orm";
import { createRoute } from "honox/factory";
import {
  getAppDb,
  getFreshUser,
} from "@/features/access-control/authorization";
import { plansTable, userTable } from "@/schema";
import UserAccessForm from "./-components/$user-access-form";

export default createRoute(async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser) return c.redirect("/login");

  const db = getAppDb(c.env);
  const actor = await getFreshUser(db, sessionUser.id);
  if (actor?.role !== "admin") {
    return c.text("Forbidden", 403);
  }

  const [users, plans] = await Promise.all([
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        planId: userTable.planId,
      })
      .from(userTable)
      .orderBy(asc(userTable.createdAt)),
    db
      .select({ id: plansTable.id, name: plansTable.name })
      .from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(asc(plansTable.name)),
  ]);

  return c.render(
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl">User management</h1>
        <p className="text-base-content/70">
          管理者権限と利用プランを変更できます。
        </p>
      </div>
      <div className="overflow-x-auto rounded-box bg-base-100 shadow">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <UserAccessForm plans={plans} user={user} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
  );
});
