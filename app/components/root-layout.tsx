import type { Child } from "hono/jsx";
import { Header } from "./header";

export const RootLayout = ({ children }: { children: Child }) => {
  return (
    <main>
      <Header />
      {children}
    </main>
  );
};
