/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: 'http://api:17643/:path*',
      },
    ];
  },
};
module.exports = nextConfig;
