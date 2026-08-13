import type { Child } from "hono/jsx";
import { useRequestContext } from "hono/jsx-renderer";
import InstallPrompt from "../islands/$install-prompt";
import LegalConsentDialog from "../islands/$legal-consent-dialog";
import PageBackButton from "../islands/$page-back";
import ScrollToTopButton from "../islands/$scroll-to-top";
import { Header } from "./header";

export const RootLayout = ({ children }: { children: Child }) => {
  const c = useRequestContext();
  const user = c.get("user");
  const isSettingsPage = c.req.path.startsWith("/settings");
  const isTopPage = c.req.path === "/";
  const isLoginPage = c.req.path === "/login";
  const isLegalPage = c.req.path === "/terms" || c.req.path === "/privacy";

  return (
    <>
      <Header />
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
      {isTopPage ? (
        <ScrollToTopButton />
      ) : !isLoginPage ? (
        <PageBackButton />
      ) : null}
      {user && !isLegalPage && <LegalConsentDialog />}
    </>
  );
};
