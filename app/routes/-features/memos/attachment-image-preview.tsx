import { useEffect, useRef, useState } from "hono/jsx";
import type { memoAttachmentsTable } from "@/schema";
import {
  clampPreviewScale,
  constrainPreviewTranslation,
  crossesGestureThreshold,
  getContainedPreviewSize,
  MIN_PREVIEW_SCALE,
  type PreviewTransform,
  resolveGestureDirection,
} from "./attachment-image-preview-state";

type MemoAttachment = typeof memoAttachmentsTable.$inferSelect;
type Point = { x: number; y: number };
type Gesture = {
  direction: ReturnType<typeof resolveGestureDirection>;
  origin: Point;
  transform: PreviewTransform;
};

const INITIAL_TRANSFORM: PreviewTransform = { scale: 1, x: 0, y: 0 };

const pointDistance = (first: Point, second: Point) =>
  Math.hypot(first.x - second.x, first.y - second.y);

export default function AttachmentImagePreview({
  attachments,
  initialIndex,
  memoId,
  onClosed,
}: {
  attachments: ReadonlyArray<MemoAttachment>;
  initialIndex: number | null;
  memoId: string;
  onClosed: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const lastTapRef = useRef(0);
  const lastPointerTypeRef = useRef<string | null>(null);
  const pointerMovedRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transform, setTransform] =
    useState<PreviewTransform>(INITIAL_TRANSFORM);
  const [gestureOffset, setGestureOffset] = useState<Point>({ x: 0, y: 0 });

  const current = attachments[currentIndex];
  const titleId = `attachment-preview-title-${memoId}`;
  const getPointers = () => {
    if (!pointersRef.current) pointersRef.current = new Map<number, Point>();
    return pointersRef.current;
  };

  const resetView = () => {
    setTransform(INITIAL_TRANSFORM);
    setGestureOffset({ x: 0, y: 0 });
    getPointers().clear();
    gestureRef.current = null;
    pinchRef.current = null;
  };

  const close = () => dialogRef.current?.close();

  const switchImage = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= attachments.length) {
      setGestureOffset({ x: 0, y: 0 });
      return;
    }
    resetView();
    setCurrentIndex(nextIndex);
  };

  const constrain = (next: PreviewTransform) => {
    const image = imageRef.current;
    const viewport = viewportRef.current;
    if (!image || !viewport) {
      return { ...next, scale: clampPreviewScale(next.scale) };
    }
    const mediaSize = getContainedPreviewSize(
      image.naturalWidth || current.mediaWidth || image.clientWidth,
      image.naturalHeight || current.mediaHeight || image.clientHeight,
      viewport.clientWidth,
      viewport.clientHeight,
    );
    return constrainPreviewTranslation(
      next,
      mediaSize.width,
      mediaSize.height,
      viewport.clientWidth,
      viewport.clientHeight,
    );
  };

  const toggleZoom = () => {
    setGestureOffset({ x: 0, y: 0 });
    setTransform((value) =>
      value.scale === MIN_PREVIEW_SCALE
        ? constrain({ scale: 2, x: 0, y: 0 })
        : INITIAL_TRANSFORM,
    );
  };

  useEffect(() => {
    if (initialIndex === null) return;
    setCurrentIndex(initialIndex);
    resetView();
  }, [initialIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || initialIndex === null || currentIndex !== initialIndex) {
      return;
    }
    if (!dialog.open) dialog.showModal();
  }, [currentIndex, initialIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      resetView();
      onClosed();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        switchImage(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        switchImage(currentIndex + 1);
      }
    };
    const handleFallbackBackdrop = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.bottom &&
        rect.left <= event.clientX &&
        event.clientX <= rect.right;
      if (!inside) dialog.close();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("keydown", handleKeyDown);
    const hasNativeLightDismiss = "closedBy" in HTMLDialogElement.prototype;
    if (!hasNativeLightDismiss) {
      dialog.addEventListener("click", handleFallbackBackdrop);
    }
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("keydown", handleKeyDown);
      if (!hasNativeLightDismiss) {
        dialog.removeEventListener("click", handleFallbackBackdrop);
      }
    };
  }, [currentIndex, attachments.length]);

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const scale = clampPreviewScale(
      transform.scale + (event.deltaY < 0 ? 0.2 : -0.2),
    );
    setGestureOffset({ x: 0, y: 0 });
    setTransform(constrain({ ...transform, scale }));
  };

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    lastPointerTypeRef.current = event.pointerType;
    pointerMovedRef.current = false;
    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events can lack an active browser pointer.
    }
    const pointers = getPointers();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      gestureRef.current = {
        direction: null,
        origin: { x: event.clientX, y: event.clientY },
        transform,
      };
    } else if (pointers.size === 2) {
      const [first, second] = Array.from(pointers.values());
      pinchRef.current = {
        distance: pointDistance(first, second),
        scale: transform.scale,
      };
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const pointers = getPointers();
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2 && pinchRef.current) {
      const [first, second] = Array.from(pointers.values());
      const distance = pointDistance(first, second);
      const scale =
        pinchRef.current.distance > 0
          ? pinchRef.current.scale * (distance / pinchRef.current.distance)
          : pinchRef.current.scale;
      setGestureOffset({ x: 0, y: 0 });
      setTransform((value) => constrain({ ...value, scale }));
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture) return;
    const deltaX = event.clientX - gesture.origin.x;
    const deltaY = event.clientY - gesture.origin.y;
    if (Math.hypot(deltaX, deltaY) >= 8) pointerMovedRef.current = true;
    if (transform.scale > MIN_PREVIEW_SCALE) {
      setTransform(
        constrain({
          ...transform,
          x: gesture.transform.x + deltaX,
          y: gesture.transform.y + deltaY,
        }),
      );
      return;
    }

    gesture.direction ??= resolveGestureDirection(deltaX, deltaY);
    if (gesture.direction === "horizontal") {
      setGestureOffset({ x: deltaX, y: 0 });
    } else if (gesture.direction === "vertical") {
      setGestureOffset({ x: 0, y: deltaY });
    }
  };

  const finishPointer = (event: PointerEvent) => {
    const gesture = gestureRef.current;
    const viewport = viewportRef.current;
    const pointers = getPointers();
    const wasSinglePointer = pointers.size === 1;
    pointers.delete(event.pointerId);

    if (!wasSinglePointer || !gesture || !viewport) {
      if (pointers.size < 2) pinchRef.current = null;
      if (pointers.size === 0) gestureRef.current = null;
      return;
    }

    const deltaX = event.clientX - gesture.origin.x;
    const deltaY = event.clientY - gesture.origin.y;
    const direction =
      gesture.direction ?? resolveGestureDirection(deltaX, deltaY);
    if (transform.scale === MIN_PREVIEW_SCALE && direction === "horizontal") {
      if (crossesGestureThreshold(deltaX, viewport.clientWidth)) {
        switchImage(currentIndex + (deltaX < 0 ? 1 : -1));
      } else {
        setGestureOffset({ x: 0, y: 0 });
      }
    } else if (
      transform.scale === MIN_PREVIEW_SCALE &&
      direction === "vertical" &&
      crossesGestureThreshold(deltaY, viewport.clientHeight)
    ) {
      close();
    } else {
      setGestureOffset({ x: 0, y: 0 });
    }

    const moved = Math.hypot(deltaX, deltaY);
    if (moved >= 8) pointerMovedRef.current = true;
    if (event.pointerType === "touch" && moved < 8) {
      const now = Date.now();
      if (now - (lastTapRef.current ?? 0) < 300) {
        toggleZoom();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
    gestureRef.current = null;
  };

  const cancelPointer = () => {
    getPointers().clear();
    gestureRef.current = null;
    pinchRef.current = null;
    pointerMovedRef.current = true;
    setGestureOffset({ x: 0, y: 0 });
  };

  const onViewportClick = () => {
    if (lastPointerTypeRef.current !== "mouse" || pointerMovedRef.current) {
      return;
    }
    close();
  };

  if (!current) return null;

  const isAtStart = currentIndex === 0;
  const isAtEnd = currentIndex === attachments.length - 1;
  const transitionClass =
    "transition-transform duration-200 motion-reduce:transition-none";

  return (
    <dialog
      aria-labelledby={titleId}
      className="modal"
      closedby="any"
      data-attachment-image-dialog={memoId}
      ref={dialogRef}
    >
      <div className="modal-box flex h-[min(92dvh,56rem)] w-[min(96vw,72rem)] max-w-none flex-col gap-3 overflow-hidden p-3 sm:p-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="truncate font-semibold" id={titleId}>
            {current.fileName}
          </h2>
          <form method="dialog">
            <button
              aria-label="画像プレビューを閉じる"
              className="btn btn-ghost btn-sm"
              type="submit"
            >
              閉じる
            </button>
          </form>
        </div>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard users can close with Escape or the labeled close buttons. */}
        <section
          aria-label="画像のズーム・移動操作"
          className="relative min-h-0 flex-1 touch-none overflow-hidden rounded-box bg-base-200"
          data-attachment-preview-viewport
          onClick={onViewportClick}
          onPointerCancel={cancelPointer}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onWheel={onWheel}
          ref={viewportRef}
        >
          <img
            alt={current.fileName}
            className={`absolute inset-0 block size-full select-none object-contain ${transitionClass}`}
            data-attachment-preview-image
            draggable="false"
            height={current.mediaHeight ?? undefined}
            onDragStart={(event: DragEvent) => event.preventDefault()}
            ref={imageRef}
            src={`/api/attachments/${current.id}?preview=1`}
            style={{
              objectFit: "contain",
              transform: `translate3d(${transform.x + gestureOffset.x}px, ${transform.y + gestureOffset.y}px, 0) scale(${transform.scale})`,
            }}
            width={current.mediaWidth ?? undefined}
          />
        </section>
        <div className="flex items-center justify-between gap-3">
          <button
            className="btn btn-sm"
            disabled={isAtStart}
            onClick={() => switchImage(currentIndex - 1)}
            type="button"
          >
            前へ
          </button>
          <p aria-live="polite" className="text-base-content/70 text-sm">
            {currentIndex + 1} / {attachments.length}
          </p>
          <button
            className="btn btn-sm"
            disabled={isAtEnd}
            onClick={() => switchImage(currentIndex + 1)}
            type="button"
          >
            次へ
          </button>
        </div>
      </div>
      <form className="modal-backdrop" method="dialog">
        <button aria-label="画像プレビューを閉じる" type="submit">
          閉じる
        </button>
      </form>
    </dialog>
  );
}
