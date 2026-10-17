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
      <a {...props} href={to}>
        {children}
      </a>
    ),
  };
});
