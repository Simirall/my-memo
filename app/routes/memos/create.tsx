import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import CreateMemoForm from "../../islands/memos/create-memo-form";
import { categoriesTable } from "../../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.MY_MEMO_D1);

  const result = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userEmail, user!.email));

  return c.render(
    <div className="flex justify-center p-8">
      <div className="card w-96 bg-base-100 shadow-sm">
        <div className="card-body">
          <CreateMemoForm categories={result} />
        </div>
      </div>
    </div>,
  );
});
