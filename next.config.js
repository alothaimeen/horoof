/** @type {import('next').NextConfig} */
const nextConfig = {
  // Custom server handles routing; disable default Next.js server
  // output: 'standalone', // not needed with custom server
  basePath: '/horoof',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/horoof',
  },
};

module.exports = nextConfig;
