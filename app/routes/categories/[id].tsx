import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import * as schema from "../../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.MY_MEMO_D1, { schema: schema });
  const id = c.req.param("id") ?? "";

  const result = await db.query.categoriesTable.findFirst({
    where: and(eq(schema.categoriesTable.userEmail, user!.email), eq(schema.categoriesTable.id, id)),
    with: {
      memos: true,
    }
  });

  if (!result) {
    return c.render(<div>Category not found</div>);
  }

  return c.render(
    <div>
      <h1 className="text-3xl font-bold">{result.name}</h1>
      <div className="flex flex-wrap gap-4 py-4">
        {result.memos.map((memo) => (
          <div
            className="card card-md w-96 bg-base-200 shadow-sm"
            key={memo.id}
          >
            <div className="card-body">
              <h2 className="card-title">{memo.title}</h2>
              <form
                action={`/api/categories/delete/${memo.id}`}
                className="card-actions justify-end"
                method="post"
              >
                <button className="btn btn-soft btn-error" type="submit">
                  🗑️
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>,
  );
});
