/** @type {import('next').NextConfig} */
const nextConfig = {
  // Custom server handles routing; disable default Next.js server
  // output: 'standalone', // not needed with custom server
  basePath: '/horoof',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/horoof',
  },

  // السماح بالوصول من الشبكة المحلية (الجوالات على نفس الـ WiFi)
  allowedDevOrigins: ['172.20.10.6'],

  // تحسينات الذاكرة — للتطوير المحلي على أجهزة محدودة الذاكرة
  experimental: {
    webpackMemoryOptimizations: true, // تحسين Webpack للذاكرة
    preloadEntriesOnStart: false,     // عدم تحميل كل الصفحات عند الإقلاع
  },
};

module.exports = nextConfig;
