import "hono/jsx";

declare module "hono/jsx" {
  namespace JSX {
    interface MediaHTMLAttributes {
      loading?: "eager" | "lazy" | undefined;
    }
  }
}
