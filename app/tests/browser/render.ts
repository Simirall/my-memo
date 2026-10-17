import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";

const roots = new Map<Element, Root>();
afterEach(() => {
  flushSync(() => {
    for (const root of roots.values()) root.unmount();
  });
  roots.clear();
});
export function render(node: ReactNode, container: Element) {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  flushSync(() => root.render(node));
}
