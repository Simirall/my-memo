import { createRoute } from "honox/factory";

export default createRoute((c) => {
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
            <button className="btn" type="submit">
              Create Memo
            </button>
          </form>
        </div>
      </div>
    </div>,
  );
});
