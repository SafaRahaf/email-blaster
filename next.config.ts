import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundles a self-contained server (server.js + minimal node_modules) so the
  // app can be shipped to a customer's Windows PC and run without npm.
  output: "standalone",
};

export default nextConfig;
