const exactPublicPaths = new Set([
  "/login",
  "/login/callback",
  "/terms",
  "/privacy",
  "/manifest.webmanifest",
  "/robots.txt",
  "/service-worker.js",
]);

const publicPathPrefixes = [
  "/api/account-deletion",
  "/api/auth",
  "/share",
  "/.well-known",
];

export const isPublicPath = (path: string) =>
  exactPublicPaths.has(path) ||
  publicPathPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
