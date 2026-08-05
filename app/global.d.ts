import type { Session, User } from "better-auth";

type MyMemoInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __myMemoInstallPrompt?: MyMemoInstallPrompt;
  }
}

declare module "hono" {
  interface Env {
    Bindings: CloudflareBindings;
  }
  interface ContextVariableMap {
    user: User | null;
    session: Session | null;
  }
}
