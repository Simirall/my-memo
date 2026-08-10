import { useEffect, useRef, useState } from "hono/jsx";
import { ConfirmDialog } from "@/components/confirm-dialog";

type FileToDelete = {
  id: string;
  name: string;
  fromDetail: boolean;
};

const getElement = <T extends Element>(
  root: { querySelector: (selector: string) => Element | null },
  selector: string,
): T | null => root.querySelector(selector) as T | null;

const setText = (
  root: { querySelector: (selector: string) => Element | null },
  selector: string,
  value: string,
) => {
  const element = getElement<HTMLElement>(root, selector);
  if (element) element.textContent = value;
};

const setDimension = (
  element: HTMLImageElement | HTMLVideoElement,
  value?: string,
) => {
  const dimension = value ? Number(value) : NaN;
  if (Number.isSafeInteger(dimension) && dimension > 0) {
    if (element instanceof HTMLImageElement) element.width = dimension;
    else element.width = dimension;
  }
};

const setHeight = (
  element: HTMLImageElement | HTMLVideoElement,
  value?: string,
) => {
  const dimension = value ? Number(value) : NaN;
  if (Number.isSafeInteger(dimension) && dimension > 0) {
    if (element instanceof HTMLImageElement) element.height = dimension;
    else element.height = dimension;
  }
};

export default function FileListController() {
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [fileToDelete, setFileToDelete] = useState<FileToDelete>();
  const confirmDeleteRef = useRef<(target: FileToDelete) => void>(() => {});

  useEffect(() => {
    if (!error && !status) return;
    const timeoutId = window.setTimeout(() => {
      setError(undefined);
      setStatus(undefined);
    }, 4_000);
    return () => window.clearTimeout(timeoutId);
  }, [error, status]);

  useEffect(() => {
    const grid = document.querySelector<HTMLElement>("[data-file-grid]");
    const dialog = document.querySelector<HTMLDialogElement>(
      "#file-detail-dialog",
    );
    if (!grid || !dialog) return;

    const mediaContainer = getElement<HTMLElement>(
      dialog,
      "[data-file-dialog-media]",
    );
    const modalDeleteButton = getElement<HTMLButtonElement>(
      dialog,
      "[data-file-dialog-delete]",
    );
    let opener: HTMLButtonElement | null = null;

    const clearMedia = () => {
      mediaContainer?.replaceChildren();
    };

    const showMediaLoading = () => {
      if (!mediaContainer) return null;
      const loading = document.createElement("div");
      loading.className = "flex min-h-40 items-center justify-center";
      loading.setAttribute("role", "status");
      loading.innerHTML =
        '<span class="loading loading-spinner loading-lg"></span><span class="sr-only">原寸画像を読み込んでいます</span>';
      mediaContainer.appendChild(loading);
      return loading;
    };

    const openDialog = (button: HTMLButtonElement) => {
      const data = button.dataset;
      opener = button;
      clearMedia();
      setText(
        dialog,
        "[data-file-dialog-title]",
        data.fileName ?? "ファイル詳細",
      );
      setText(dialog, "[data-file-dialog-name]", data.fileName ?? "");
      setText(dialog, "[data-file-dialog-type]", data.contentType ?? "");
      setText(dialog, "[data-file-dialog-size]", data.fileSize ?? "");
      setText(
        dialog,
        "[data-file-dialog-category]",
        data.categoryName ?? "未分類",
      );
      setText(dialog, "[data-file-dialog-memo-title]", data.memoTitle ?? "");
      setText(
        dialog,
        "[data-file-dialog-memo-excerpt]",
        data.memoExcerpt ?? "",
      );

      const memoLink = getElement<HTMLAnchorElement>(
        dialog,
        "[data-file-dialog-memo-link]",
      );
      if (memoLink) {
        memoLink.href = data.memoHref ?? "/";
        memoLink.hidden = !data.memoHref;
      }

      if (modalDeleteButton) {
        modalDeleteButton.dataset.fileId = data.fileId ?? "";
        modalDeleteButton.dataset.fileName = data.fileName ?? "";
        modalDeleteButton.ariaLabel = `ファイル「${data.fileName ?? ""}」を削除`;
      }

      const endpoint = data.endpoint;
      const previewKind = data.previewKind;
      if (mediaContainer && endpoint && previewKind === "image") {
        const loading = showMediaLoading();
        const image = document.createElement("img");
        image.alt = data.fileName ?? "画像ファイル";
        image.className =
          "mx-auto block max-h-[min(60dvh,32rem)] h-auto max-w-full rounded-box object-contain";
        image.loading = "lazy";
        image.src = `${endpoint}?preview=1`;
        image.addEventListener("load", () => loading?.remove(), { once: true });
        image.addEventListener(
          "error",
          () => {
            loading?.remove();
            const alert = document.createElement("div");
            alert.className = "alert alert-error";
            alert.setAttribute("role", "alert");
            alert.textContent = "原寸画像を読み込めませんでした。";
            mediaContainer.replaceChildren(alert);
          },
          { once: true },
        );
        setDimension(image, data.mediaWidth);
        setHeight(image, data.mediaHeight);
        mediaContainer.appendChild(image);
      } else if (mediaContainer && endpoint && previewKind === "audio") {
        const audio = document.createElement("audio");
        audio.className = "w-full";
        audio.controls = true;
        audio.preload = "metadata";
        audio.volume = 0.25;
        audio.src = `${endpoint}?preview=1`;
        mediaContainer.appendChild(audio);
      } else if (mediaContainer && endpoint && previewKind === "video") {
        const video = document.createElement("video");
        video.className =
          "mx-auto block max-h-[min(65dvh,40rem)] h-auto max-w-full rounded-box object-contain";
        video.controls = true;
        video.preload = "metadata";
        video.volume = 0.25;
        video.src = `${endpoint}?preview=1`;
        setDimension(video, data.mediaWidth);
        setHeight(video, data.mediaHeight);
        mediaContainer.appendChild(video);
      }

      dialog.showModal();
    };

    const findCard = (fileId: string) =>
      Array.from(grid.querySelectorAll<HTMLElement>("[data-file-card]")).find(
        (card) => card.dataset.fileCard === fileId,
      );

    const deleteFile = async (fileId: string) => {
      setError(undefined);
      setStatus("削除しています…");
      try {
        const response = await fetch(
          `/api/attachments/${encodeURIComponent(fileId)}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(
            payload.message ?? "ファイルを削除できませんでした。",
          );
        }

        findCard(fileId)?.remove();
        if (dialog.open) dialog.close();
        setStatus("ファイルを削除しました。");

        const remaining = grid.querySelectorAll("[data-file-card]").length;
        if (remaining > 0) return;

        const currentUrl = new URL(window.location.href);
        const page = Number(currentUrl.searchParams.get("page") ?? "1");
        if (Number.isSafeInteger(page) && page > 1) {
          currentUrl.searchParams.set("page", String(page - 1));
          window.location.assign(currentUrl.toString());
          return;
        }

        grid.hidden = true;
        const emptyMessage = document.createElement("p");
        emptyMessage.className =
          "rounded-box bg-base-200 p-6 text-center text-base-content/70";
        emptyMessage.dataset.fileListEmpty = "true";
        emptyMessage.textContent = "ファイルはまだありません。";
        grid.insertAdjacentElement("beforebegin", emptyMessage);
      } catch (cause) {
        setStatus(undefined);
        setError(
          cause instanceof Error
            ? cause.message
            : "ファイルを削除できませんでした。",
        );
      }
    };

    confirmDeleteRef.current = (target) => {
      if (target.fromDetail && dialog.open) dialog.close();
      void deleteFile(target.id);
    };

    const onGridClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const deleteButton =
        target.closest<HTMLButtonElement>("[data-file-delete]");
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        setFileToDelete({
          id: deleteButton.dataset.fileId ?? "",
          name: deleteButton.dataset.fileName ?? "",
          fromDetail: false,
        });
        return;
      }

      const openButton = target.closest<HTMLButtonElement>("[data-file-open]");
      if (openButton) {
        event.preventDefault();
        openDialog(openButton);
      }
    };

    const onDialogClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const deleteButton = target.closest<HTMLButtonElement>(
        "[data-file-dialog-delete]",
      );
      if (!deleteButton) return;
      event.preventDefault();
      setFileToDelete({
        id: deleteButton.dataset.fileId ?? "",
        name: deleteButton.dataset.fileName ?? "",
        fromDetail: true,
      });
    };

    const onClose = () => {
      clearMedia();
      opener?.focus();
      opener = null;
    };

    grid.addEventListener("click", onGridClick);
    dialog.addEventListener("click", onDialogClick);
    dialog.addEventListener("close", onClose);

    const onFallbackBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isDialogContent) dialog.close();
    };

    const hasNativeLightDismiss = "closedBy" in HTMLDialogElement.prototype;
    if (!hasNativeLightDismiss) {
      dialog.addEventListener("click", onFallbackBackdropClick);
    }

    return () => {
      confirmDeleteRef.current = () => {};
      grid.removeEventListener("click", onGridClick);
      dialog.removeEventListener("click", onDialogClick);
      dialog.removeEventListener("close", onClose);
      if (!hasNativeLightDismiss) {
        dialog.removeEventListener("click", onFallbackBackdropClick);
      }
    };
  }, []);

  return (
    <>
      <div
        className="toast toast-end toast-bottom pointer-events-none z-50"
        data-file-list-controller
      >
        {error && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-error pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="alert"
          >
            {error}
          </div>
        )}
        {status && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-success pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="status"
          >
            {status}
          </div>
        )}
      </div>
      <ConfirmDialog
        confirmLabel="削除"
        description={
          fileToDelete ? `「${fileToDelete.name}」を削除しますか？` : ""
        }
        destructive
        onCancel={() => setFileToDelete(undefined)}
        onConfirm={() => {
          const target = fileToDelete;
          setFileToDelete(undefined);
          if (!target) return;
          confirmDeleteRef.current?.(target);
        }}
        open={Boolean(fileToDelete)}
        title="削除の確認"
      />
    </>
  );
}
