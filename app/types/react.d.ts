import "react";

declare module "react" {
  interface MediaHTMLAttributes<T> {
    loading?: "lazy" | "eager";
  }
}
