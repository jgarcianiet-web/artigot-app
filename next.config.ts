import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite subir a las acciones del servidor el Excel del personal o varios documentos a la vez (hasta 5 MB cada uno)
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default nextConfig;
