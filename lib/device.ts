/**
 * Server-side handheld (phone/tablet) detection from the User-Agent.
 *
 * Why UA sniffing rather than a CSS media query:
 *
 * The nav layout was broken twice on a real Samsung Galaxy Tab A11 (SM-X135G)
 * because CSS-only signals lied about the device:
 *
 *  1. `md:` (768px) — the tablet reported a 768-1023px CSS viewport, so the
 *     desktop sidebar rendered on an 8-11" screen AND the hamburger hid.
 *  2. `lg:` (1024px), then `lg:pointer-fine:` — the tablet still reported a
 *     >=1024px CSS width (Android tablets can report a wide layout viewport
 *     even with "Desktop site" OFF), and did not report a coarse pointer.
 *
 * Viewport width and the `pointer` media feature are therefore both unreliable
 * on real Android tablets. The User-Agent is the one signal that unambiguously
 * says "this is a handheld", so the nav shell keys off this instead. Desktop
 * browsers still get the width-based sidebar; handhelds always get the drawer.
 *
 * This is deliberately narrow in scope: it decides ONLY whether to render the
 * persistent sidebar vs. the hamburger drawer. It must never gate data, auth,
 * or business logic.
 */
export function isHandheldUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle|PlayBook/i.test(
    userAgent
  );
}
