import trashIcon from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import { PhosphorIcon } from "@/routes/-shared";

export const FileDetailDialog = () => (
  <dialog
    aria-labelledby="file-detail-dialog-title"
    className="modal"
    closedby="any"
    id="file-detail-dialog"
  >
    <div className="modal-box max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <h2
          className="card-title break-all"
          data-file-dialog-title
          id="file-detail-dialog-title"
        >
          ファイル詳細
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
      <div className="mt-4" data-file-dialog-media />
      <dl className="mt-4 grid gap-2 rounded-box bg-base-200 p-4 sm:grid-cols-3">
        <div>
          <dt className="text-base-content/70 text-sm">ファイル名</dt>
          <dd className="break-all font-semibold" data-file-dialog-name />
        </div>
        <div>
          <dt className="text-base-content/70 text-sm">種類</dt>
          <dd className="break-all" data-file-dialog-type />
        </div>
        <div>
          <dt className="text-base-content/70 text-sm">容量</dt>
          <dd data-file-dialog-size />
        </div>
        <div>
          <dt className="text-base-content/70 text-sm">カテゴリー</dt>
          <dd data-file-dialog-category />
        </div>
      </dl>
      <section
        aria-labelledby="file-detail-memo-heading"
        className="mt-6 space-y-2"
      >
        <h3 className="font-bold text-lg" id="file-detail-memo-heading">
          添付されているメモ
        </h3>
        <p className="font-semibold" data-file-dialog-memo-title />
        <p
          className="whitespace-pre-wrap text-base-content/80"
          data-file-dialog-memo-excerpt
        />
        <a className="link link-info" data-file-dialog-memo-link href="/">
          メモを開く
        </a>
      </section>
      <div className="modal-action">
        <button
          className="btn btn-soft btn-error"
          data-file-dialog-delete
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
