import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  webpack: (config, { nextRuntime }) => {
    // edge（Cloudflare Pages）では、fetch を差し替える ponyfill を本物の fetch に置き換える。
    // そのままだと next-on-pages の globalThis の Proxy を通して Worker 全体の fetch が
    // XHR 版になり、API の fetch が XMLHttpRequest is not defined で失敗する（src/lib/shims/cross-fetch.js）
    if (nextRuntime === 'edge') {
      config.resolve.alias = {
        ...config.resolve.alias,
        'cross-fetch$': fileURLToPath(new URL('./src/lib/shims/cross-fetch.js', import.meta.url)),
        'fetch-ponyfill$': fileURLToPath(new URL('./src/lib/shims/fetch-ponyfill.js', import.meta.url)),
      };
    }
    return config;
  },
};

export default nextConfig;
