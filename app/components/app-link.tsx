"use client";

import type { AnchorHTMLAttributes } from "react";
import { Link } from "waku/router/client";
import { useAppRouter } from "./navigation";

export function AppLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const router = useAppRouter();
  const { href, ...rest } = props;
  if (
    !href?.startsWith("/") ||
    href.startsWith("//") ||
    href.startsWith("/api/") ||
    href === "/share" ||
    props.target ||
    props.download
  ) {
    return <a {...props} />;
  }
  return (
    <Link
      {...rest}
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
        void router.push(href);
      }}
      to={href as Extract<Parameters<typeof Link>[0]["to"], string>}
    >
      {props.children}
    </Link>
  );
}
