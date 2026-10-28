"use client";

import trashIcon from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import { type Ref, useState } from "react";
import { AppLink } from "@/components/app-link";
import { PhosphorIcon } from "@/components/phosphor-icon";
import {
  formatAttachmentSize,
  getAttachmentPreviewKind,
} from "@/features/attachments/model/attachment-constants";

export type FileDetail = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  mediaWidth: number | null;
  mediaHeight: number | null;
  categoryName: string | null;
  memoTitle: string;
  memoExcerpt: string;
  memoHref: string;
};

const setInitialMediaVolume = (element: HTMLMediaElement | null) => {
  if (element) element.volume = 0.25;
};

function FilePreview({ file }: { file: FileDetail }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const kind = getAttachmentPreviewKind(file.contentType);
  const src = `/api/attachments/${encodeURIComponent(file.id)}?preview=1`;
  if (kind === "image")
    return (
      <>
        {status === "loading" && (
          <div
            className="flex min-h-40 items-center justify-center"
            role="status"
          >
            <span className="loading loading-spinner loading-lg" />
            <span className="sr-only">原寸画像を読み込んでいます</span>
          </div>
        )}
        {status === "error" ? (
          <div className="alert alert-error" role="alert">
            原寸画像を読み込めませんでした。
          </div>
        ) : (
          <img
            alt={file.fileName}
            className="rounded-box mx-auto block h-auto max-h-[min(60dvh,32rem)] max-w-full object-contain"
            height={file.mediaHeight ?? undefined}
            loading="lazy"
            onError={() => setStatus("error")}
            onLoad={() => setStatus("loaded")}
            src={src}
            width={file.mediaWidth ?? undefined}
          />
        )}
      </>
    );
  if (kind === "audio")
    return (
      // biome-ignore lint/a11y/useMediaCaption: User-uploaded media has no caption source.
      <audio
        className="w-full"
        controls
        preload="metadata"
        ref={setInitialMediaVolume}
        src={src}
      />
    );
  if (kind === "video")
    return (
      // biome-ignore lint/a11y/useMediaCaption: User-uploaded media has no caption source.
      <video
        className="rounded-box mx-auto block h-auto max-h-[min(65dvh,40rem)] max-w-full object-contain"
        controls
        height={file.mediaHeight ?? undefined}
        preload="metadata"
        ref={setInitialMediaVolume}
        src={src}
        width={file.mediaWidth ?? undefined}
      />
    );
  return null;
}

export const FileDetailDialog = ({
  file,
  ref,
  onClose,
  onDelete,
}: {
  file?: FileDetail;
  ref: Ref<HTMLDialogElement>;
  onClose: () => void;
  onDelete: () => void;
}) => (
  // biome-ignore lint/a11y/useKeyWithClickEvents: Only handles backdrop clicks; the native dialog handles Escape.
  <dialog
    aria-labelledby="file-detail-dialog-title"
    className="modal"
    closedby="any"
    id="file-detail-dialog"
    onClick={(event) => {
      const dialog = event.currentTarget;
      if ("closedBy" in HTMLDialogElement.prototype || event.target !== dialog)
        return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }}
    onClose={onClose}
    ref={ref}
  >
    <div className="modal-box max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <h2
          className="card-title break-all"
          data-file-dialog-title
          id="file-detail-dialog-title"
        >
          {file?.fileName ?? "ファイル詳細"}
        </h2>
        <form method="dialog">
          <button
            aria-label="ファイル詳細を閉じる"
            className="btn btn-ghost btn-sm"
            type="submit"
          >
            閉じる
          </button>
        </form>
      </div>
      <div className="mt-4" data-file-dialog-media>
        {file && <FilePreview file={file} key={file.id} />}
      </div>
      <dl className="rounded-box bg-base-200 mt-4 grid gap-2 p-4 sm:grid-cols-3">
        <div>
          <dt className="text-base-content/70 text-sm">ファイル名</dt>
          <dd className="font-semibold break-all">{file?.fileName}</dd>
        </div>
        <div>
          <dt className="text-base-content/70 text-sm">種類</dt>
          <dd className="break-all">{file?.contentType}</dd>
        </div>
        <div>
          <dt className="text-base-content/70 text-sm">容量</dt>
          <dd>{file && formatAttachmentSize(file.sizeBytes)}</dd>
        </div>
        <div>
          <dt className="text-base-content/70 text-sm">カテゴリー</dt>
          <dd>{file?.categoryName ?? "未分類"}</dd>
        </div>
      </dl>
      <section
        aria-labelledby="file-detail-memo-heading"
        className="mt-6 space-y-2"
      >
        <h3 className="text-lg font-bold" id="file-detail-memo-heading">
          添付されているメモ
        </h3>
        <p className="font-semibold" data-file-dialog-memo-title>
          {file?.memoTitle}
        </p>
        <p className="text-base-content/80 whitespace-pre-wrap">
          {file?.memoExcerpt}
        </p>
        {file && (
          <AppLink className="link link-info" href={file.memoHref}>
            メモを開く
          </AppLink>
        )}
      </section>
      <div className="modal-action">
        <button
          aria-label={`ファイル「${file?.fileName ?? ""}」を削除`}
          className="btn btn-soft btn-error"
          data-file-dialog-delete
          onClick={onDelete}
          type="button"
        >
          <PhosphorIcon svg={trashIcon} />
          削除
        </button>
        <form method="dialog">
          <button className="btn" type="submit">
            閉じる
          </button>
        </form>
      </div>
    </div>
    <form className="modal-backdrop" method="dialog">
      <button aria-label="ファイル詳細を閉じる" type="submit">
        閉じる
      </button>
    </form>
  </dialog>
);
