import type { ReactNode } from "react";
import { RootLayout } from "@/components/root-layout";
import { getRequestContext } from "@/server/request-context";

export default function Layout({ children }: { children: ReactNode }) {
  const user = getRequestContext().get("user");
  const displayUser = user
    ? {
        name: user.name,
        image: user.image,
        role: (user as { role?: string }).role,
      }
    : null;
  return <RootLayout user={displayUser}>{children}</RootLayout>;
}
export const getConfig = () => ({ render: "dynamic" as const });
