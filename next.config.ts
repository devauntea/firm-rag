import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;

/*
output: 'standalone' tells Next.js to trace exactly which files your app
needs at runtime and copy only those, plus a minimal, self-contained server.js,
into a separate .next/standalone folder. That folder is small, complete,
and runnable with nothing but Node itself 
*/