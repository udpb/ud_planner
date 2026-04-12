import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native 바인딩을 가진 패키지는 번들링 제외
  // - @napi-rs/canvas: .node native binding (pdfjs-dist polyfill용)
  // - pdfjs-dist: legacy build는 dynamic import로 로드
  serverExternalPackages: [
    '@napi-rs/canvas',
    'pdfjs-dist',
    'pdf-parse',
  ],
};

export default nextConfig;
