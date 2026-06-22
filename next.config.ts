import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
    // We send base64 images/PDFs (avatars, signatures, readiness scans) through
    // Server Actions; raise the default 1MB body cap to fit them.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
