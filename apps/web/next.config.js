/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: 'http://api:6371/:path*',
      },
    ];
  },
};
module.exports = nextConfig;
