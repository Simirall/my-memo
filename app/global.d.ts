import type {} from "hono";
import type { AuthType } from "./auth";

type Bindings = {};
type Variables = AuthType;

declare module "hono" {
  interface Env {
    Variables: Variables;
    Bindings: Bindings;
  }
}
