import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project. Without this, Turbopack may
    // walk up and pick up an unrelated lockfile in a parent directory.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
