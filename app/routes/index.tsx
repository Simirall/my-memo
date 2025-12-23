import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import * as schema from "../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.MY_MEMO_D1, { schema: schema });

  const result = await db.query.memosTable.findMany({
    with: {
      category: true,
    },
    where: eq(schema.memosTable.userEmail, user!.email),
  });


  return c.render(
    <div>
      <div className="flex gap-4">
        <a className="btn" href="/memos/create">
          Create Memo
        </a>
        <a className="btn" href="/categories">
          Categories
        </a>
      </div>
      <div className="flex flex-wrap gap-4 py-4">
        {result.map((memo) => (
          <div
            className="card card-md w-96 bg-base-200 shadow-sm"
            key={memo.id}
          >
            <div className="card-body">
              <h2 className="card-title">{memo.title}</h2>
              {memo.category && (
                <div className="badge badge-xl badge-soft">
                  {memo.category.name}
                </div>
              )}
              <p>{memo.content}</p>
              <form
                action={`/api/memos/delete/${memo.id}`}
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
