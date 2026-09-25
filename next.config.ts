import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project. Without this, Turbopack may
    // walk up and pick up an unrelated lockfile in a parent directory.
    root: path.resolve(__dirname),
  },
  // pdf-parse pulls in @napi-rs/canvas, a native binding that can't be
  // bundled into a Server Component's ESM chunk. Keep both external so
  // they resolve via native require() at runtime instead.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
