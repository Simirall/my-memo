import type { Session, User } from "better-auth";

declare module "hono" {
  interface Env {
    Bindings: CloudflareBindings;
  }
  interface ContextVariableMap {
    user: User | null;
    session: Session | null;
  }
}
