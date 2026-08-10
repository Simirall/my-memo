import {
  isPendingShare,
  isShareFresh,
  type PendingShare,
  SHARE_MAX_AGE_MS,
  SHARE_STORAGE_KEY,
} from "@/features/sharing/model/share";

export const readPendingShare = (): PendingShare | undefined => {
  try {
    const raw = window.sessionStorage.getItem(SHARE_STORAGE_KEY);
    if (!raw) return undefined;

    const parsed: unknown = JSON.parse(raw);
    if (!isPendingShare(parsed) || !isShareFresh(parsed)) {
      window.sessionStorage.removeItem(SHARE_STORAGE_KEY);
      return undefined;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(SHARE_STORAGE_KEY);
    return undefined;
  }
};

export const writePendingShare = (pendingShare: PendingShare) => {
  window.sessionStorage.setItem(
    SHARE_STORAGE_KEY,
    JSON.stringify({
      ...pendingShare,
      receivedAt: Date.now(),
    }),
  );
};

export const clearPendingShare = () => {
  window.sessionStorage.removeItem(SHARE_STORAGE_KEY);
};

export const pendingShareMaxAge = SHARE_MAX_AGE_MS;
