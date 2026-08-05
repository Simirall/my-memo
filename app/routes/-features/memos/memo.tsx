import pencilSimpleIcon from "@phosphor-icons/core/assets/regular/pencil-simple.svg?raw";
import { marked } from "marked";
import type z from "zod";
import type { categorySchema } from "@/routes/-features/categories";
import type { Tag } from "@/routes/-features/tags";
import { MemoTagList } from "@/routes/-features/tags";
import { DeleteButton, FolderOpenIcon, PhosphorIcon } from "@/routes/-shared";
import type { memoSchema } from "./memo-schema";
import { sanitizeHtml } from "./sanitize-html";

type MemoWithTags = z.infer<typeof memoSchema.read> & {
  category?: z.infer<typeof categorySchema.read> | null;
  tags?: ReadonlyArray<Tag>;
  memoTags?: ReadonlyArray<{ tag: Tag | null }>;
};

export const Memo = ({
  memo,
  showCategory = true,
}: {
  memo: MemoWithTags;
  showCategory?: boolean;
}) => {
  const tags =
    memo.tags ??
    memo.memoTags
      ?.flatMap((memoTag) => (memoTag.tag ? [memoTag.tag] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "ja")) ??
    [];

  return (
    <div
      className="card card-md w-120 bg-base-200 shadow-sm"
      data-memo-card={memo.id}
      key={memo.id}
    >
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
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div data-memo-tag-list>
              <MemoTagList tags={tags} />
            </div>
            <button
              aria-label={`タグを編集: ${memo.title}`}
              className="btn btn-info btn-square btn-xs"
              data-memo-id={memo.id}
              data-memo-tag-edit
              data-memo-tags={JSON.stringify(tags)}
              data-memo-title={memo.title}
              type="button"
            >
              <PhosphorIcon
                className="inline-flex shrink-0 [&_svg]:size-4"
                svg={pencilSimpleIcon}
              />
            </button>
          </div>
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
