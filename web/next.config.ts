import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 폴더(홈)의 package-lock.json 을 추적 범위에 넣지 않도록 루트를 고정한다.
  outputFileTracingRoot: process.cwd(),
  images: {
    localPatterns: [{ pathname: "/api/images/**" }],
  },
};

export default nextConfig;
