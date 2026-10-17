import type { AnchorHTMLAttributes, ReactNode } from "react";
import { vi } from "vitest";

vi.mock("waku/router/client", async () => {
  const { navigation } = await import("./navigation");
  return {
    useRouter: () => navigation,
    Link: ({
      to,
      children,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
      to: string;
      children: ReactNode;
    }) => (
      <a
        {...props}
        href={to}
        onClick={(event) => {
          props.onClick?.(event);
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          void navigation.push(to);
        }}
      >
        {children}
      </a>
    ),
  };
});
