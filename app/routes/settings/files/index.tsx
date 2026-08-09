import fileIcon from "@phosphor-icons/core/assets/regular/file.svg?raw";
import speakerHighIcon from "@phosphor-icons/core/assets/regular/speaker-high.svg?raw";
import trashIcon from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import videoCameraIcon from "@phosphor-icons/core/assets/regular/video-camera.svg?raw";
import { createRoute } from "honox/factory";
import {
  buildFileListUrl,
  getEmptyFileListRedirectUrl,
  getFileCategories,
  getFileList,
  getMemoExcerpt,
  parseFileListQuery,
} from "@/routes/-features/files";
import FileListController from "@/routes/-features/files/$file-list-controller";
import { FileDetailDialog } from "@/routes/-features/files/file-detail-dialog";
import { PhosphorIcon } from "@/routes/-shared";
import {
  formatAttachmentSize,
  getAttachmentPreviewKind,
} from "@/utils/attachment-constants";
import { getAppDb } from "@/utils/authorization";
import { SettingsLayout } from "../-components/settings-layout";

const getPreviewLabel = (kind: ReturnType<typeof getAttachmentPreviewKind>) => {
  if (kind === "video") return "動画";
  if (kind === "audio") return "音声";
  if (kind === "image") return "画像";
  return "ファイル";
};

const getPreviewIcon = (kind: ReturnType<typeof getAttachmentPreviewKind>) => {
  if (kind === "video") return videoCameraIcon;
  if (kind === "audio") return speakerHighIcon;
  return fileIcon;
};

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  const db = getAppDb(c.env);
  const categories = await getFileCategories(db, user.id);
  const query = parseFileListQuery(
    new URL(c.req.url).searchParams,
    new Set(categories.map((category) => category.id)),
  );
  const result = await getFileList(db, user.id, query);
  const emptyPageRedirect = getEmptyFileListRedirectUrl(
    c.req.path,
    query,
    result.items.length,
  );
  if (emptyPageRedirect) return c.redirect(emptyPageRedirect);

  const returnTo = buildFileListUrl(c.req.path, query);

  return c.render(
    <SettingsLayout activeSection="files">
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-2xl">ファイル</h1>
          <p className="text-base-content/70">
            メモに添付したファイルを一覧・管理します。
          </p>
        </div>

        <form
          action="/settings/files"
          className="flex flex-wrap items-end gap-3"
          method="get"
        >
          <label
            className="flex min-w-52 flex-1 flex-col gap-1"
            htmlFor="file-category-filter"
          >
            カテゴリー
            <select
              className="select w-full"
              id="file-category-filter"
              name="category"
            >
              <option selected={!query.category} value="">
                すべて
              </option>
              <option
                selected={query.category === "uncategorized"}
                value="uncategorized"
              >
                未分類
              </option>
              {categories.map((category) => (
                <option
                  key={category.id}
                  selected={query.category === category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit">
            絞り込む
          </button>
        </form>

        {result.items.length === 0 ? (
          <p
            className="rounded-box bg-base-200 p-6 text-center text-base-content/70"
            data-file-list-empty
          >
            ファイルはまだありません。
          </p>
        ) : (
          <ul
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
            data-file-grid
          >
            {result.items.map((file) => {
              const previewKind = getAttachmentPreviewKind(file.contentType);
              const memoHref = `/memos/${encodeURIComponent(file.memo.id)}/edit?returnTo=${encodeURIComponent(returnTo)}`;
              const previewLabel = getPreviewLabel(previewKind);
              const previewIcon = getPreviewIcon(previewKind);

              return (
                <li className="min-w-0" data-file-card={file.id} key={file.id}>
                  <article className="card card-border h-full min-w-0 cursor-pointer bg-base-100 shadow-sm">
                    <button
                      aria-label={`ファイル「${file.fileName}」の詳細を表示`}
                      className="block w-full cursor-pointer text-left"
                      data-category-name={file.category?.name ?? ""}
                      data-content-type={file.contentType}
                      data-endpoint={`/api/attachments/${encodeURIComponent(file.id)}`}
                      data-file-id={file.id}
                      data-file-name={file.fileName}
                      data-file-open
                      data-file-size={formatAttachmentSize(file.sizeBytes)}
                      data-media-height={file.mediaHeight ?? undefined}
                      data-media-width={file.mediaWidth ?? undefined}
                      data-memo-excerpt={getMemoExcerpt(file.memo.content)}
                      data-memo-href={memoHref}
                      data-memo-title={file.memo.title}
                      data-preview-kind={previewKind ?? undefined}
                      type="button"
                    >
                      <figure className="aspect-video overflow-hidden bg-base-200">
                        {previewKind === "image" ? (
                          <img
                            alt={file.fileName}
                            className="block h-full w-full object-contain"
                            height={file.mediaHeight ?? undefined}
                            loading="lazy"
                            src={`/api/attachments/${encodeURIComponent(file.id)}?variant=thumbnail`}
                            width={file.mediaWidth ?? undefined}
                          />
                        ) : (
                          <div
                            aria-label={`${previewLabel}ファイルのプレビュー`}
                            className="flex h-full w-full items-center justify-center bg-base-300 text-base-content/70"
                            role="img"
                          >
                            <PhosphorIcon
                              className="inline-flex [&_svg]:size-12"
                              svg={previewIcon}
                            />
                          </div>
                        )}
                      </figure>
                      <div className="card-body gap-2 p-3">
                        <h2 className="line-clamp-2 break-all font-semibold">
                          {file.fileName}
                        </h2>
                        <p className="text-base-content/70 text-sm">
                          {formatAttachmentSize(file.sizeBytes)}
                        </p>
                        <p className="line-clamp-2 text-sm">
                          メモ: {file.memo.title}
                        </p>
                      </div>
                    </button>
                    <div className="card-actions justify-end px-3 pb-3">
                      <button
                        aria-label={`ファイル「${file.fileName}」を削除`}
                        className="btn btn-soft btn-error btn-sm"
                        data-file-delete
                        data-file-id={file.id}
                        data-file-name={file.fileName}
                        type="button"
                      >
                        <PhosphorIcon svg={trashIcon} />
                        削除
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {(query.page > 1 || result.hasNextPage) && (
          <nav
            aria-label="ファイル一覧ページ"
            className="flex justify-center gap-3"
          >
            {query.page > 1 ? (
              <a
                className="btn"
                href={buildFileListUrl(c.req.path, {
                  ...query,
                  page: query.page - 1,
                })}
              >
                前のページ
              </a>
            ) : (
              <span />
            )}
            <span className="self-center text-base-content/70">
              {query.page}ページ
            </span>
            {result.hasNextPage && (
              <a
                className="btn"
                href={buildFileListUrl(c.req.path, {
                  ...query,
                  page: query.page + 1,
                })}
              >
                次のページ
              </a>
            )}
          </nav>
        )}
      </div>
      <FileDetailDialog />
      <FileListController />
    </SettingsLayout>,
  );
});
