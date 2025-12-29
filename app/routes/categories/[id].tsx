import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { Memo } from "../../components/memo";
import * as schema from "../../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.MY_MEMO_D1, { schema: schema });
  const id = c.req.param("id") ?? "";

  const result = await db.query.categoriesTable.findFirst({
    where: and(
      eq(schema.categoriesTable.userEmail, user!.email),
      eq(schema.categoriesTable.id, id),
    ),
    with: {
      memos: true,
    },
  });

  if (!result) {
    return c.render(<div>Category not found</div>);
  }

  return c.render(
    <div>
      <div className="badge badge-xl badge-soft badge-primary">
        {result.name}
      </div>
      <div className="flex flex-wrap items-start justify-center gap-4 py-4">
        {result.memos.map((memo) => (
          <Memo key={memo.id} memo={memo} />
        ))}
      </div>
    </div>,
  );
});
