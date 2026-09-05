import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

export default NextAuth(authConfig).auth

export const config = {
  // PWA assets (manifest, service worker, offline fallback, icons, apple
  // touch icon) carry no session data and must be reachable while signed
  // out — otherwise the SW registers against an HTML 302 response (MIME
  // error) and the install prompt never appears (quick-260905-kyw).
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|apple-icon|trt-logo.webp|manifest.webmanifest|sw.js|offline|icons/).*)",
  ],
}
