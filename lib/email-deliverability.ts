// PURE module — zero imports, no `dns`, no `fetch`, no `db`, no React. Every
// exported function here is a pure decision derived entirely from its inputs.
//
// FINDING (quick task 260731-sgo, verified live 2026-07-31): SendGrid's Email
// Validation API (`POST /v3/validations/email`) was the originally requested
// mechanism for detecting undeliverable addresses, but it is NOT provisioned
// on this account — the endpoint returns `403 {"errors":[{"message":"access
// forbidden"}]}`, and `GET /v3/scopes` (200, 206 scopes) contains zero
// validation scopes at all; `validations.email.create` is entirely absent.
// It is a separate paid add-on this account does not have. Do not call it.
//
// The substitute built here is two complementary signals instead:
//   - DNS/MX (free, predictive — catches a dead domain like @trtarredo.demo
//     before a single send is ever attempted)
//   - SendGrid's own suppression lists (bounces, blocks, invalid_emails —
//     reactive, authoritative record of addresses that actually failed)
//
// The tri-state `boolean | null` on DeliverabilityVerdict.deliverable exists
// precisely so a transient DNS failure (a resolver hiccup: SERVFAIL, timeout,
// refused, etc.) is representable as "unknown" rather than collapsing into
// "undeliverable" — a resolver hiccup must NEVER brand a real user's working
// address as dead.

export type DeliverabilityVerdict = {
  deliverable: boolean | null
  reason: string | null
}

// DNS error codes that indicate a transient resolver problem, not an
// authoritative "this domain cannot receive mail" answer. ANY of these on
// either the MX or the A lookup collapses the whole verdict to `null`
// (unknown) — this is the single most important rule in this file.
export const TRANSIENT_DNS_CODES = [
  'ESERVFAIL',
  'ETIMEOUT',
  'ETIMEDOUT',
  'EREFUSED',
  'ECONNREFUSED',
  'ENOTIMP',
  'EBADRESP',
] as const

/**
 * PURE. Extracts and normalizes the domain part of an email address.
 * Lowercased, trimmed. Returns null for anything without a usable `@`,
 * an empty local part, or an empty domain part.
 */
export function emailDomain(address: string): string | null {
  const trimmed = address.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return null
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!local || !domain) return null
  return domain.toLowerCase()
}

type DnsOutcome = {
  mx: { exchange: string }[]
  mxErrorCode: string | null
  aCount: number
  aErrorCode: string | null
}

/**
 * PURE. Classifies a raw DNS lookup outcome (MX + fallback A lookup) into a
 * deliverability verdict. See the header comment for why the transient-code
 * branch below is the load-bearing case in this whole file.
 */
export function classifyDnsOutcome(outcome: DnsOutcome): DeliverabilityVerdict {
  const { mx, mxErrorCode, aCount, aErrorCode } = outcome

  // ANY transient/unrecognised code on either lookup wins first — a resolver
  // hiccup must never be allowed to fall through into a false "undeliverable".
  const codes = [mxErrorCode, aErrorCode].filter((c): c is string => c !== null)
  for (const code of codes) {
    if ((TRANSIENT_DNS_CODES as readonly string[]).includes(code)) {
      return { deliverable: null, reason: null }
    }
  }

  if (mx.length > 0) {
    // RFC 7505 "null MX": a single record with exchange '.' is an explicit
    // declaration that the domain accepts no mail at all.
    if (mx.length === 1 && mx[0].exchange === '.') {
      return {
        deliverable: false,
        reason: 'domain publishes a null MX record (RFC 7505) — it accepts no mail',
      }
    }
    return { deliverable: true, reason: null }
  }

  // NXDOMAIN on the MX lookup — the domain does not exist at all. This is the
  // @trtarredo.demo case.
  if (mxErrorCode === 'ENOTFOUND') {
    return { deliverable: false, reason: 'domain does not exist (DNS NXDOMAIN)' }
  }

  // No MX (or ENODATA, meaning the domain exists but has no MX records) — an
  // A record alone is still a legal mail destination (RFC 5321 §5.1 implicit
  // MX).
  if (mxErrorCode === null || mxErrorCode === 'ENODATA') {
    if (aCount > 0) {
      return { deliverable: true, reason: null }
    }
    if (aErrorCode === 'ENODATA' || aErrorCode === 'ENOTFOUND' || aCount === 0) {
      return {
        deliverable: false,
        reason: 'domain has no MX and no A record — it cannot receive mail',
      }
    }
  }

  // Anything else unrecognised falls back to unknown rather than guessing.
  return { deliverable: null, reason: null }
}

type SuppressionInput = {
  list: string
  status?: string | null
  reason?: string | null
}

/**
 * PURE. A suppression record is always an authoritative "this address
 * bounced/blocked/was invalid" — always `deliverable: false`. The reason
 * string is never empty: falls back from `reason` to `status` to a generic
 * message.
 */
export function classifySuppression(input: SuppressionInput): DeliverabilityVerdict {
  const detail = input.reason || input.status || 'listed by SendGrid'
  return { deliverable: false, reason: `${input.list}: ${detail}` }
}

/**
 * PURE. A suppression verdict always wins, even over a DNS verdict saying
 * deliverable — SendGrid's own record of an actual failure outranks a DNS
 * prediction. If there is no suppression record, the DNS verdict passes
 * through unchanged.
 */
export function mergeVerdicts(
  dns: DeliverabilityVerdict,
  suppression: DeliverabilityVerdict | null,
): DeliverabilityVerdict {
  if (suppression !== null) return suppression
  return dns
}

/**
 * PURE. The banner shows ONLY when we have a confident "undeliverable"
 * verdict and the user hasn't dismissed it this session. `emailDeliverable
 * === null` (never checked, or last check was inconclusive) always renders
 * nothing — silence is correct for unknown; a scary banner on a transient
 * resolver failure would be worse than no banner at all.
 */
export function shouldShowDeliverabilityBanner(input: {
  emailDeliverable: boolean | null
  dismissed: boolean
}): boolean {
  return input.emailDeliverable === false && input.dismissed === false
}
