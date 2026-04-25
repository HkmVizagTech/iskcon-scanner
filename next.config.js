/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["localhost"],
  },
  // Disable strict mode for scanner to avoid double renders
  reactStrictMode: false,
};

// Only use PWA in production
if (process.env.NODE_ENV === "production") {
  const withPWA = require("next-pwa")({
    dest: "public",
    register: true,
    skipWaiting: true,
  });
  module.exports = withPWA(nextConfig);
} else {
  module.exports = nextConfig;
}
