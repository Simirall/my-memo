import { describe, expect, it } from "vitest";
import {
  clampPreviewScale,
  constrainPreviewTranslation,
  crossesGestureThreshold,
  getContainedPreviewSize,
  resolveGestureDirection,
} from "./attachment-image-preview-state";

describe("画像プレビューの状態計算", () => {
  it("倍率を1倍から3倍の範囲に制限する", () => {
    expect(clampPreviewScale(0.5)).toBe(1);
    expect(clampPreviewScale(2)).toBe(2);
    expect(clampPreviewScale(4)).toBe(3);
  });

  it("小さな移動を無視し、支配的な軸へ方向を固定する", () => {
    expect(resolveGestureDirection(4, 3)).toBeNull();
    expect(resolveGestureDirection(12, 6)).toBe("horizontal");
    expect(resolveGestureDirection(6, -12)).toBe("vertical");
  });

  it("表示領域の20パーセントをジェスチャー成立境界にする", () => {
    expect(crossesGestureThreshold(99, 500)).toBe(false);
    expect(crossesGestureThreshold(-100, 500)).toBe(true);
  });

  it("等倍では中央へ戻し、拡大時は画像が消えない範囲へ移動を制限する", () => {
    expect(
      constrainPreviewTranslation(
        { scale: 1, x: 100, y: -100 },
        400,
        300,
        500,
        500,
      ),
    ).toEqual({ scale: 1, x: 0, y: 0 });
    expect(
      constrainPreviewTranslation(
        { scale: 2, x: 999, y: -999 },
        400,
        300,
        500,
        500,
      ),
    ).toEqual({ scale: 2, x: 150, y: -50 });
  });

  it("縦長と横長の画像をcontainした実表示寸法へ変換する", () => {
    expect(getContainedPreviewSize(400, 800, 1000, 500)).toEqual({
      width: 250,
      height: 500,
    });
    expect(getContainedPreviewSize(800, 400, 1000, 500)).toEqual({
      width: 1000,
      height: 500,
    });
  });
});
