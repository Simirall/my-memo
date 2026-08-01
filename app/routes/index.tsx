import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { Memo } from "../components/memo";
import * as schema from "../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.MY_MEMO_D1, { schema: schema });

  const result = await db.query.memosTable.findMany({
    with: {
      category: true,
    },
    where: eq(schema.memosTable.userId, user!.id),
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
      <div className="flex flex-wrap items-start justify-center gap-4 py-4">
        {result.map((memo) => (
          <Memo key={memo.id} memo={memo} />
        ))}
      </div>
    </div>,
  );
});
