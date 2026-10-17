const POSITION = "my-memo:navigation-position";

export function trackHistory(confirmNavigation: () => boolean) {
  const { history } = window;
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  let position: number = history.state?.[POSITION] ?? 0;
  let restoring = false;
  originalReplace.call(history, { ...history.state, [POSITION]: position }, "");

  const push: History["pushState"] = (data, title, url) => {
    originalPush.call(
      history,
      { ...data, [POSITION]: position + 1 },
      title,
      url,
    );
    position += 1;
  };
  const replace: History["replaceState"] = (data, title, url) => {
    originalReplace.call(
      history,
      { ...data, [POSITION]: position },
      title,
      url,
    );
  };
  const onPop = (event: PopStateEvent) => {
    const next: unknown = event.state?.[POSITION];
    if (restoring) {
      restoring = false;
      event.stopImmediatePropagation();
      return;
    }
    if (typeof next !== "number") return;
    if (next !== position && !confirmNavigation()) {
      // popstateは取り消せないため、Wakuへ渡す前に元の履歴位置へ戻す。
      event.stopImmediatePropagation();
      restoring = true;
      history.go(position - next);
      return;
    }
    position = next;
  };

  history.pushState = push;
  history.replaceState = replace;
  window.addEventListener("popstate", onPop, { capture: true });
  return () => {
    history.pushState = originalPush;
    history.replaceState = originalReplace;
    window.removeEventListener("popstate", onPop, { capture: true });
  };
}
