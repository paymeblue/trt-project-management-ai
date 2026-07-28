// ── Pure, DB-free audit-asset helpers (quick task 260728-lbx) ────────────
// No imports on purpose: this module is shared by a server component (the
// audit page) and a 'use client' component (AuditAssetGallery), and is
// unit-tested directly with zero mocking, mirroring assembleAuditRows in
// lib/project-audit.ts.

export type AuditAsset = {
  dataUrl: string
  label: string
  context?: string
  downloadName?: string
}

// SECURITY (quick task 260728-lbx, threat T-bpp-03): this strict, literal
// `data:image/` prefix check is the ONLY thing that decides whether an
// asset becomes interactive (openable in the lightbox). Two rules, both
// load-bearing:
//   (a) it must stay case-sensitive and untrimmed — normalising case or
//       trimming whitespace would widen what counts as an "image" and could
//       let a crafted `data:text/html` (or `DATA:IMAGE/...`) payload slip
//       through some other permissive check reusing this gate;
//   (b) a passing asset is only ever rendered as an `<img src>` inside the
//       app's own document — never as an `href` the browser navigates to.
//       A `data:text/html` document opened in the top frame would execute
//       as the app origin, but an `<img>` element cannot execute script
//       regardless of payload, so this gate is sufficient to keep the
//       rendering path safe even though it does no HTML/script sanitising
//       of its own.
export function isImageAsset(dataUrl: string | null | undefined): boolean {
  return dataUrl != null && dataUrl.startsWith('data:image/')
}

export function imageAssetsOnly(assets: AuditAsset[]): AuditAsset[] {
  return assets.filter((a) => isImageAsset(a.dataUrl))
}
