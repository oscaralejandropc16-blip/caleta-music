import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  // Solo usar "export" para builds de Capacitor (APK/iOS).
  // Railway necesita modo servidor para que funcionen las API routes (/api/deezer, /api/download, etc.)
  ...(isStaticExport ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
