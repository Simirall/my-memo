import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { memosTable } from "../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.MY_MEMO_D1);

  const result = await db
    .select()
    .from(memosTable)
    .where(eq(memosTable.userEmail, user!.email));

  return c.render(
    <div>
      <a className="btn" href="/memos/create">
        Create Memo
      </a>
      <div className="flex flex-wrap gap-4 py-4">
        {result.map((memo) => (
          <div
            className="card card-md w-96 bg-base-200 shadow-sm"
            key={memo.id}
          >
            <div className="card-body">
              <h2 className="card-title">{memo.title}</h2>
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
