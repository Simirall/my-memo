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
      <div className="badge badge-xl badge-soft badge-primary">
        {result.name}
      </div>
      <div className="flex flex-wrap gap-4 py-4">
        {result.memos.map((memo) => (
          <div
            className="card card-md w-120 bg-base-200 shadow-sm"
            key={memo.id}
          >
            <div className="card-body">
              {memo.url ? (
                <a
                  className="card-title text-info text-xl hover:underline"
                  href={memo.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {memo.title}
                </a>
              ) : (
                <h2 className="card-title text-xl">{memo.title}</h2>
              )}
              {memo.aiGenerated === 1 && (
                <div className="badge badge-soft badge-info">
                  ✨ AI Generated
                </div>
              )}
              <p className="whitespace-pre-wrap">{memo.content}</p>
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
