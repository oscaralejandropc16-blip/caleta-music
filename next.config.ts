import type { NextConfig } from "next";

// Railway/Docker: NEXT_OUTPUT=standalone → servidor Node con API routes
// Capacitor (APK/iOS): STATIC_EXPORT=true → archivos HTML estáticos
// Dev local: ninguno → modo desarrollo normal
const outputMode = process.env.NEXT_OUTPUT === "standalone"
  ? "standalone" as const
  : process.env.STATIC_EXPORT === "true"
    ? "export" as const
    : undefined;

const nextConfig: NextConfig = {
  ...(outputMode ? { output: outputMode } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
