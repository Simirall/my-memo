import { marked } from "marked";
import type z from "zod";
import type { categorySchema } from "../routes/api/categories/categoriesSchema";
import type { memoSchema } from "../routes/api/memos/memoSchema";

export const Memo = ({
  memo,
}: {
  memo: z.infer<typeof memoSchema.read> & {
    category?: z.infer<typeof categorySchema.read> | null;
  };
}) => {
  return (
    <div className="card card-md w-120 bg-base-200 shadow-sm" key={memo.id}>
      <div className="card-body">
        {memo.url ? (
          <a
            className="card-title break-all text-info text-xl hover:underline"
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
            <div className="badge badge-soft badge-info">✨ AI Generated</div>
          )}
        </div>
        <div className="*:space-y-4 [&_h1,&_h2]:font-bold [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_p]:whitespace-pre-wrap [&_ul]:list-inside [&_ul]:list-disc">
          <div
            dangerouslySetInnerHTML={{
              __html: marked.parse(memo.content) as string,
            }}
          />
        </div>
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
  );
};
