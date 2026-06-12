/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    // On Vercel the API calls go same-origin to /backend-api and get proxied
    // server-side to the Hetzner backend (no mixed content, API stays hidden).
    const target = process.env.BACKEND_PROXY_TARGET;
    if (!target) {
      return [];
    }
    return [{ source: "/backend-api/:path*", destination: `${target}/:path*` }];
  }
};

export default nextConfig;
