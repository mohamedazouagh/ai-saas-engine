import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project. Without this, Turbopack may
    // walk up and pick up an unrelated lockfile in a parent directory.
    root: path.resolve(__dirname),
  },
  // pdf-parse pulls in @napi-rs/canvas, a native binding that can't be
  // bundled into a Server Component's ESM chunk, and pdfjs-dist, which
  // loads its worker via a runtime `import(GlobalWorkerOptions.workerSrc)`
  // call. If pdfjs-dist is left to Turbopack's bundler, that dynamic
  // import gets rewritten into a chunk-relative lookup and fails with
  // "Cannot find module .../chunks/ssr/pdf.worker.mjs" because the worker
  // file isn't part of the SSR chunk graph. Keep all three external so
  // they resolve via native require()/import() at runtime instead.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
};

export default nextConfig;
