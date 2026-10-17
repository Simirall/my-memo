import { createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";
import { NavigationProvider } from "@/components/navigation";

const roots = new Map<Element, Root>();
afterEach(() => {
  flushSync(() => {
    for (const root of roots.values()) root.unmount();
  });
  roots.clear();
});
export function render(node: ReactNode, container: Element) {
  flushSync(() => {
    for (const [element, root] of roots) {
      if (element.isConnected) continue;
      root.unmount();
      roots.delete(element);
    }
  });
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  flushSync(() => root.render(createElement(NavigationProvider, null, node)));
}
