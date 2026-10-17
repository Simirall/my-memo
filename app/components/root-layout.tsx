"use client";

import type { User } from "better-auth";
import type { ReactNode as Child } from "react";
import { useRouter } from "waku/router/client";
import InstallPrompt from "../islands/$install-prompt";
import LegalConsentDialog from "../islands/$legal-consent-dialog";
import ScrollToTopButton from "../islands/$scroll-to-top";
import { Header } from "./header";
import { NavigationFailure } from "./navigation";

export const RootLayout = ({
  children,
  user,
}: {
  children: Child;
  user: (Pick<User, "name" | "image"> & { role?: string }) | null;
}) => {
  const { path } = useRouter();
  const isSettingsPage = path.startsWith("/settings");
  const isTopPage = path === "/";
  const isLoginPage = path === "/login";
  const isLegalPage = path === "/terms" || path === "/privacy";

  return (
    <>
      <NavigationFailure />
      <Header path={path} user={user} />
      {user && !isSettingsPage && <InstallPrompt mode="banner" />}
      <main
        className={
          isSettingsPage
            ? "h-[calc(100dvh-4rem)] overflow-y-auto p-4"
            : "min-h-[calc(100svh-4rem)] p-4"
        }
      >
        {children}
      </main>
      {!isLoginPage && <ScrollToTopButton showBackButton={!isTopPage} />}
      {user && !isLegalPage && <LegalConsentDialog />}
    </>
  );
};
