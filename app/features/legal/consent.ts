export const LEGAL_CONSENT_STORAGE_KEY = "my-memo:legal-consent-at";
export const LEGAL_EFFECTIVE_AT = "2026-08-13T00:00:00+09:00";
export const LEGAL_EFFECTIVE_DATE_LABEL = "2026年8月13日";

export const hasCurrentLegalConsent = (acceptedAt: string | null) => {
  if (!acceptedAt) return false;

  const acceptedAtTime = Date.parse(acceptedAt);
  return (
    Number.isFinite(acceptedAtTime) &&
    acceptedAtTime >= Date.parse(LEGAL_EFFECTIVE_AT)
  );
};

export const hasStoredCurrentLegalConsent = (
  storage: Pick<Storage, "getItem">,
) => {
  try {
    return hasCurrentLegalConsent(storage.getItem(LEGAL_CONSENT_STORAGE_KEY));
  } catch {
    return false;
  }
};
