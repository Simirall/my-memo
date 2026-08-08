import type { Child } from "hono/jsx";
import { useRequestContext } from "hono/jsx-renderer";
import InstallPrompt from "../islands/$install-prompt";
import ScrollToTopButton from "../islands/$scroll-to-top";
import { Header } from "./header";

export const RootLayout = ({ children }: { children: Child }) => {
  const c = useRequestContext();
  const user = c.get("user");
  const isSettingsPage = c.req.path.startsWith("/settings");

  return (
    <>
      <Header />
      {user && !isSettingsPage && <InstallPrompt mode="banner" />}
      <main className="min-h-[calc(100svh-4rem)] p-4">{children}</main>
      <ScrollToTopButton />
    </>
  );
};
