import { asc, eq } from "drizzle-orm";
import {
  getAppDb,
  getFreshUser,
} from "@/features/access-control/authorization";
import UserAccessForm from "@/routes/admin/users/-components/$user-access-form";
import { plansTable, userTable } from "@/schema";
import {
  forbidden,
  getRequestContext,
  redirect,
} from "@/server/request-context";

export default async function Page() {
  const c = getRequestContext();
  const sessionUser = c.get("user");
  if (!sessionUser) return redirect("/login");

  const db = getAppDb(c.env);
  const actor = await getFreshUser(db, sessionUser.id);
  if (actor?.role !== "admin") {
    return forbidden();
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <title>ユーザー管理 | My Memo</title>
      <div>
        <h1 className="text-2xl font-bold">ユーザー管理</h1>
        <p className="text-base-content/70">
          管理者権限と利用プランを変更できます。
        </p>
      </div>
      <div className="rounded-box bg-base-100 overflow-x-auto shadow">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">ユーザー名</th>
              <th scope="col">メールアドレス</th>
              <th scope="col">権限とプラン</th>
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
    </div>
  );
}

export const getConfig = () => ({ render: "dynamic" as const });
