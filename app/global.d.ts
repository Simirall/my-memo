import type { Session, User } from "better-auth";

declare module "hono" {
  interface Env {
    Bindings: Env.Bindings;
  }
  interface ContextVariableMap {
    user: User | null;
    session: Session | null;
  }
}
