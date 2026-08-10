export type PreviewTransform = {
  scale: number;
  x: number;
  y: number;
};

export type GestureDirection = "horizontal" | "vertical";

export const MIN_PREVIEW_SCALE = 1;
export const MAX_PREVIEW_SCALE = 3;
export const PREVIEW_GESTURE_THRESHOLD_RATIO = 0.2;

export const clampPreviewScale = (scale: number) =>
  Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, scale));

export const resolveGestureDirection = (
  deltaX: number,
  deltaY: number,
  minimumDistance = 8,
): GestureDirection | null => {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < minimumDistance) {
    return null;
  }
  return Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
};

export const crossesGestureThreshold = (distance: number, extent: number) =>
  extent > 0 && Math.abs(distance) >= extent * PREVIEW_GESTURE_THRESHOLD_RATIO;

export const getContainedPreviewSize = (
  mediaWidth: number,
  mediaHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) => {
  if (
    mediaWidth <= 0 ||
    mediaHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return { width: viewportWidth, height: viewportHeight };
  }
  const ratio = Math.min(
    viewportWidth / mediaWidth,
    viewportHeight / mediaHeight,
  );
  return { width: mediaWidth * ratio, height: mediaHeight * ratio };
};

export const constrainPreviewTranslation = (
  transform: PreviewTransform,
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): PreviewTransform => {
  const scale = clampPreviewScale(transform.scale);
  if (scale === MIN_PREVIEW_SCALE) return { scale, x: 0, y: 0 };

  const maxX = Math.max(0, (imageWidth * scale - viewportWidth) / 2);
  const maxY = Math.max(0, (imageHeight * scale - viewportHeight) / 2);
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, transform.x)),
    y: Math.min(maxY, Math.max(-maxY, transform.y)),
  };
};
