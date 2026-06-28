/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared TS source package directly (no prebuild step).
  transpilePackages: ["@pipeline/shared"],
  // Mongoose/bullmq are server-only; keep them external to the server bundle.
  serverExternalPackages: ["mongoose", "bullmq", "ioredis"],
};

export default nextConfig;
