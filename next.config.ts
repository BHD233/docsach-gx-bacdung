import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  // PGlite (Postgres nhúng) chỉ dùng khi chạy local không có DATABASE_URL
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
