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
        <a className="btn btn-primary" href="/memos/create">
          Create Memo
        </a>
        <a className="btn btn-secondary" href="/memos/url-summary">
          Create WebPage Summary
        </a>
        <a className="btn btn-accent" href="/categories">
          Categories
        </a>
      </div>
      <div className="flex flex-wrap gap-4 py-4">
        {result.map((memo) => (
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
              <div className="flex items-center gap-2">
                {memo.category && (
                  <a
                    className="badge badge-soft badge-primary badge-xl hover:translate-y-0.5"
                    href={`/categories/${memo.category.id}`}
                  >
                    {memo.category.name}
                  </a>
                )}
                {memo.aiGenerated === 1 && (
                  <div className="badge badge-soft badge-info">
                    ✨ AI Generated
                  </div>
                )}
              </div>
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
