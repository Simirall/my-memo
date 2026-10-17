"use client";

import type { AnchorHTMLAttributes } from "react";
import { Link } from "waku/router/client";

export function AppLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
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
      to={href as Extract<Parameters<typeof Link>[0]["to"], string>}
    >
      {props.children}
    </Link>
  );
}
