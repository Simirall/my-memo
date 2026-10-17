"use client";

import type { AnchorHTMLAttributes } from "react";
import { Link } from "waku/router/client";
import { useNavigationConfirmation } from "./navigation";

export function AppLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const confirmNavigation = useNavigationConfirmation();
  const { href, ...rest } = props;
  if (
    !href?.startsWith("/") ||
    href.startsWith("//") ||
    href.startsWith("/api/") ||
    href === "/share" ||
    props.target ||
    (props.download !== undefined &&
      props.download !== null &&
      props.download !== false)
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
        if (confirmNavigation?.() === false) event.preventDefault();
      }}
      to={href as Extract<Parameters<typeof Link>[0]["to"], string>}
    >
      {props.children}
    </Link>
  );
}
