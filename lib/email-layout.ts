// Shared branded email layout (quick task 260728-eml). One shell renders
// every outbound TRT PM email — table-based, inline-styled, with no inline
// stylesheet block, no vector-graphic wordmark, and no remote raster image
// — because Outlook (Word rendering engine) and Gmail strip stylesheet
// blocks and vector graphics outright, and most clients block remote images
// by default. This environment's APP_URL is localhost anyway, so a remote
// image src would 404 for every real recipient.
//
// NO `import 'server-only'` here: this module must be unit-testable and is
// imported by lib/email-templates.ts, which itself has no `server-only`
// guard for the same reason.

/**
 * Escapes a value for safe interpolation into HTML body text (between tags).
 *
 * WHY this exists: project names, user names and checklist labels are
 * user-authored free text that lands inside an email HTML document rendered
 * by a third-party mail client — a real injection surface. A stray `<` also
 * silently eats the rest of a paragraph in most clients even without any
 * malicious intent, so this is a correctness fix as much as a security one.
 *
 * Order matters: `&` MUST be escaped first. Escaping `&` last would
 * double-escape the entities produced by the `<`/`>`/`"`/`'` replacements
 * (e.g. `&lt;` would become `&amp;lt;`).
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Escapes a value for safe interpolation into an HTML attribute context
 * (e.g. `href="..."`). Same entity set as escapeHtml — attributes are
 * quoted with `"` here, so `"` must be escaped to prevent breaking out of
 * the attribute, and `<`/`>` are escaped defensively for the same reason.
 *
 * NOTE: the real URLs this project passes through here (verify/reset links
 * built as `${APP_URL}/verify-email?token=...`) never contain `&`, so this
 * escaping does not collide with the existing `tests/lib/email.test.ts`
 * assertions that the raw URL string appears verbatim in the rendered html.
 * Do not weaken this escaping to make a future test with an `&`-bearing URL
 * pass — fix the test fixture instead.
 */
export function escapeAttr(value: unknown): string {
  return escapeHtml(value)
}

const ABSOLUTE_HTTP_URL = /^https?:\/\//i

/**
 * Resolves a path or already-absolute URL against APP_URL, read at CALL time
 * (not module load) so tests can stub the env per-case with `vi.stubEnv`.
 *
 * WHY: an email is read outside the app's own origin (a mail client has no
 * "current page" to resolve a relative href against), so a relative link is
 * always a bug — it would 404 or open the mail client's own domain. This
 * throws instead of silently emitting a broken link, and also rejects any
 * non-http(s) scheme (e.g. `javascript:`) as an injection-hardening measure
 * for any future caller that builds a URL from user input.
 */
export function absoluteUrl(pathOrUrl: string): string {
  if (ABSOLUTE_HTTP_URL.test(pathOrUrl)) return pathOrUrl

  if (!pathOrUrl.startsWith('/')) {
    throw new Error(
      `absoluteUrl: refusing to emit a relative email link: ${pathOrUrl}`,
    )
  }

  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmedBase}${pathOrUrl}`
}

export type CtaButtonInput = { label: string; url: string }

/**
 * "Bulletproof button": an outer role="presentation" table with a
 * background-coloured, border-radius/padding <td> wrapping a white-text
 * <a>, preceded by a VML fallback for Outlook's Word rendering engine
 * (which ignores CSS padding/border-radius on anchors entirely — the VML
 * `<v:roundrect>` shape is the only reliable way to get a rounded, padded
 * button in classic Outlook).
 */
export function ctaButton({ label, url }: CtaButtonInput): string {
  const safeUrl = escapeAttr(url)
  const safeLabel = escapeHtml(label)
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="10%" stroke="f" fillcolor="#f97316">
<w:anchorlock/>
<center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td style="background-color:#f97316;border-radius:6px;">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">${safeLabel}</a>
    </td>
  </tr>
</table>
<!--<![endif]-->`.trim()
}

export type RenderBrandedEmailInput = {
  preheader: string
  heading: string
  /**
   * Pre-rendered HTML paragraph bodies. CONTRACT: callers must escape any
   * interpolated user-controlled value themselves (via escapeHtml) before
   * passing it here — renderBrandedEmail does NOT re-escape paragraph
   * content, so templates can deliberately pass through safe markup like
   * `<strong>` for emphasis.
   */
  paragraphs: string[]
  cta?: CtaButtonInput
  footNote?: string
  /** Pre-built plaintext body; when omitted, derived from heading + paragraphs. */
  textBody?: string
}

function stripTagsAndUnescape(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// Hidden preheader filler: a run of zero-width-space + non-breaking-space
// pairs so mail clients don't spill the visible body text into the inbox
// preview line after the intended preheader string ends.
const PREHEADER_FILLER = '&#8203;&nbsp;'.repeat(40)

export function renderBrandedEmail({
  preheader,
  heading,
  paragraphs,
  cta,
  footNote,
  textBody,
}: RenderBrandedEmailInput): { html: string; text: string } {
  const ctaHtml = cta ? `
      <tr>
        <td style="padding:8px 32px 0 32px;" align="center">
          ${ctaButton(cta)}
        </td>
      </tr>` : ''

  const footNoteHtml = footNote ? `
      <tr>
        <td style="padding:16px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#52525b;">
          ${footNote}
        </td>
      </tr>` : ''

  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;">${p}</p>`,
    )
    .join('\n          ')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}${PREHEADER_FILLER}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#9d4300;background-image:linear-gradient(135deg,#f97316,#9d4300);padding:24px 32px;" align="center">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:2px;font-weight:700;color:#ffffff;font-size:20px;">TRT ARREDO</div>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;font-size:12px;opacity:0.9;margin-top:2px;">Project Management</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;font-size:16px;line-height:1.6;">
            <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#18181b;">${escapeHtml(heading)}</h1>
          ${paragraphsHtml}
          </td>
        </tr>${ctaHtml}${footNoteHtml}
        <tr>
          <td style="padding:24px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#71717a;">
            You are receiving this because you have a TRT PM account.<br>
            TRT Arredo Project Management
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  const text =
    textBody ??
    [
      heading,
      '',
      ...paragraphs.map(stripTagsAndUnescape),
      ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
      ...(footNote ? ['', stripTagsAndUnescape(footNote)] : []),
      '',
      'You are receiving this because you have a TRT PM account.',
      'TRT Arredo Project Management',
    ].join('\n')

  return { html, text }
}
