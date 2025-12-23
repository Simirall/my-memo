import type { Child } from "hono/jsx";
import { Header } from "./header";

export const RootLayout = ({ children }: { children: Child }) => {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100svh-4rem)] p-8">{children}</main>
    </>
  );
};
