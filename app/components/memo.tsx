import { marked } from "marked";
import type z from "zod";
import { DeleteButton } from "../islands/delete-button";
import type { categorySchema } from "../routes/api/categories/categoriesSchema";
import type { memoSchema } from "../routes/api/memos/memoSchema";
import { sanitizeHtml } from "../utils/sanitizeHtml";
import { FolderOpenIcon } from "./folder-open-icon";

export const Memo = ({
  memo,
  showCategory = true,
}: {
  memo: z.infer<typeof memoSchema.read> & {
    category?: z.infer<typeof categorySchema.read> | null;
  };
  showCategory?: boolean;
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
        {showCategory && memo.category && (
          <a
            className="flex w-fit items-center gap-1 text-primary hover:underline"
            href={`/categories/${memo.category.id}`}
          >
            <FolderOpenIcon />
            {memo.category.name}
          </a>
        )}
        <div className="flex items-center gap-2">
          {memo.aiGenerated === 1 && (
            <div className="badge badge-soft badge-info">✨ AI Generated</div>
          )}
        </div>
        <div className="*:space-y-4 [&_h1,&_h2]:font-bold [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_p]:whitespace-pre-wrap [&_ul]:list-inside [&_ul]:list-disc">
          <div
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(marked.parse(memo.content) as string),
            }}
          />
        </div>
        <DeleteButton action={`/api/memos/delete/${memo.id}`} />
      </div>
    </div>
  );
};
