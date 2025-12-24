import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRoute } from "honox/factory";
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
          <form
            action="/api/memos/create"
            className="flex flex-col gap-4"
            method="post"
          >
            <input
              className="input"
              name="title"
              placeholder="Title"
              required
              type="text"
            />
            <textarea
              className="textarea"
              name="content"
              placeholder="Content"
              required
            />
            <input className="input" name="url" placeholder="URL" type="text" />
            {result.length > 0 && (
              <select className="select" name="categoryId">
                <option value="">Select Category</option>
                {result.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
            <button className="btn" type="submit">
              Create Memo
            </button>
          </form>
        </div>
      </div>
    </div>,
  );
});
