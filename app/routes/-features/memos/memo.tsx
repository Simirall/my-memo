import pencilSimpleIcon from "@phosphor-icons/core/assets/regular/pencil-simple.svg?raw";
import { marked } from "marked";
import type z from "zod";
import type { categorySchema } from "@/routes/-features/categories";
import type { Tag } from "@/routes/-features/tags";
import { MemoTagList } from "@/routes/-features/tags";
import { DeleteButton, FolderOpenIcon, PhosphorIcon } from "@/routes/-shared";
import type { memoAttachmentsTable } from "@/schema";
import AttachmentManager from "./$attachment-manager";
import type { memoSchema } from "./memo-schema";
import { sanitizeHtml } from "./sanitize-html";

type MemoWithTags = z.infer<typeof memoSchema.read> & {
  category?: z.infer<typeof categorySchema.read> | null;
  tags?: ReadonlyArray<Tag>;
  memoTags?: ReadonlyArray<{ tag: Tag | null }>;
  attachments?: ReadonlyArray<typeof memoAttachmentsTable.$inferSelect>;
};

export const Memo = ({
  memo,
  showCategory = true,
  returnTo = "/",
}: {
  memo: MemoWithTags;
  showCategory?: boolean;
  returnTo?: string;
}) => {
  const tags =
    memo.tags ??
    memo.memoTags
      ?.flatMap((memoTag) => (memoTag.tag ? [memoTag.tag] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "ja")) ??
    [];

  return (
    <div
      className="card card-md card-body memo-card-grid memo-card-grid-row w-full min-w-0 bg-base-200 shadow-sm"
      data-memo-card={memo.id}
      key={memo.id}
    >
      <div className="grid content-start gap-4">
        <div className="grid content-start gap-2">
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
          {((showCategory && memo.category) || memo.aiGenerated === 1) && (
            <div className="flex flex-wrap items-center gap-2">
              {showCategory && memo.category && (
                <a
                  className="badge badge-soft badge-primary flex w-fit items-center gap-1"
                  href={`/categories/${memo.category.id}`}
                >
                  <FolderOpenIcon />
                  {memo.category.name}
                </a>
              )}
              {memo.aiGenerated === 1 && (
                <div className="badge">✨ AI Generated</div>
              )}
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1" data-memo-tag-list>
              <MemoTagList tags={tags} />
            </div>
            <button
              aria-label={`タグを編集: ${memo.title}`}
              className={
                tags.length > 0
                  ? "btn btn-accent btn-soft btn-square btn-xs shrink-0"
                  : "btn btn-accent btn-soft btn-xs shrink-0 gap-1 px-3"
              }
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
              {tags.length === 0 && "タグを編集"}
            </button>
          </div>
        </div>
        <div className="grid content-start">
          <div className="*:space-y-4 [&_h1,&_h2]:font-bold [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_p]:whitespace-pre-wrap [&_ul]:list-inside [&_ul]:list-disc">
            <div
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(marked.parse(memo.content) as string),
              }}
            />
          </div>
          <AttachmentManager
            initialAttachments={memo.attachments}
            memoId={memo.id}
            readOnly
          />
        </div>
      </div>
      <div className="flex w-full gap-2">
        <a
          className="btn btn-soft btn-accent grow"
          href={`/memos/${encodeURIComponent(memo.id)}/edit?returnTo=${encodeURIComponent(
            returnTo,
          )}`}
        >
          編集
        </a>
        <DeleteButton action={`/api/memos/delete/${memo.id}`} />
      </div>
    </div>
  );
};
