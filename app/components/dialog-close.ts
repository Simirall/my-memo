export const afterDialogCloseAnimation = (
  dialog: HTMLDialogElement,
  callback: () => void,
) => {
  const modalBox = dialog.querySelector<HTMLElement>(".modal-box");
  const style = modalBox ? getComputedStyle(modalBox) : null;
  const toMilliseconds = (value: string) =>
    value.endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1_000;
  const durations =
    style?.transitionDuration.split(",").map(toMilliseconds) ?? [];
  const delays = style?.transitionDelay.split(",").map(toMilliseconds) ?? [];
  const closeDuration = durations.reduce(
    (longest, duration, index) =>
      Math.max(longest, duration + (delays[index % delays.length] ?? 0)),
    0,
  );

  if (closeDuration === 0) {
    callback();
    return;
  }

  window.setTimeout(() => {
    if (!dialog.open) callback();
  }, closeDuration);
};
