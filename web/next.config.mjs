const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ] }];
  },
};
export default nextConfig;
