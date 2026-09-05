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
  // Quick task 260728-vpm: defence-in-depth against a CDN/proxy (Netlify)
  // emitting a default Permissions-Policy that strips camera/microphone
  // from the document. The app uses no iframe today, so this isn't the
  // current cause of the video-call room's media failures, but an explicit
  // self-allow makes that failure mode impossible going forward.
  // display-capture is included because CallControls (@stream-io/video-react-sdk)
  // renders a screen-share button.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self)",
          },
        ],
      },
      // Quick task 260905-kyw: Netlify would otherwise serve public/ assets
      // with a long-lived cache, letting a bad/stale service worker survive
      // a deploy. must-revalidate forces a conditional GET on every load.
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
