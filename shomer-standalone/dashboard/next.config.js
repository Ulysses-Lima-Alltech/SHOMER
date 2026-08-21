/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '/shomer',
  assetPrefix: '/shomer',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    NEXT_PUBLIC_INGESTION_URL: process.env.NEXT_PUBLIC_INGESTION_URL || 'http://localhost:3001',
  },
}

module.exports = nextConfig




