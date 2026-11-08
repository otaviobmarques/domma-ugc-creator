import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes com binários/recursos nativos ficam fora do bundle.
  serverExternalPackages: ["ffmpeg-static", "pg-boss"],
  // Inclui o ffmpeg empacotado e a fonte das legendas nas funções da Vercel.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/ffmpeg-static/ffmpeg", "./assets/fonts/**"],
  },
};

export default nextConfig;
