import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite subir el Excel del personal (hasta 5 MB) a las acciones del servidor
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
