import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
import { DeleteButton } from "../../islands/delete-button";
import { categoriesTable } from "../../schema";

export default createRoute(async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.MY_MEMO_D1);

  const result = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, user!.id));

  return c.render(
    <div>
      <a className="btn" href="/categories/create2">
        Create Category
      </a>
      <div className="flex flex-wrap gap-4 py-4">
        {result.map((category) => (
          <div
            className="card card-md w-40 bg-base-200 shadow-sm"
            key={category.id}
          >
            <div className="card-body">
              <a
                className="card-title text-info hover:underline"
                href={`/categories/${category.id}`}
              >
                {category.name}
              </a>
              <DeleteButton action={`/api/categories/delete/${category.id}`} />
            </div>
          </div>
        ))}
      </div>
    </div>,
  );
});
