import 'server-only'
import { resolveMx, resolve4 } from 'node:dns/promises'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { sendGridApiKey } from '@/lib/email'
import {
  emailDomain,
  classifyDnsOutcome,
  classifySuppression,
  mergeVerdicts,
  type DeliverabilityVerdict,
} from '@/lib/email-deliverability'

// THIN IMPURE WRAPPER. This file owns zero classification logic of its own —
// every decision (deliverable / undeliverable / unknown, and why) is
// delegated to the pure functions in lib/email-deliverability.ts. A later
// editor adding branching logic HERE instead of there is the one mistake
// this file exists to prevent: keep it thin, keep the pure module the single
// source of truth.

type DnsProbeCache = Map<string, DeliverabilityVerdict>

/**
 * Resolves MX for `domain`, falling back to an A-record lookup only when MX
 * yielded nothing or ENODATA (mirrors RFC 5321 §5.1's implicit-MX rule, which
 * classifyDnsOutcome implements). Never rethrows — every DNS error is
 * captured as a string error code and handed to the pure classifier, which
 * treats unrecognised/transient codes as "unknown", never "undeliverable".
 */
export async function probeDomainDns(
  domain: string,
  cache?: DnsProbeCache,
): Promise<DeliverabilityVerdict> {
  const cached = cache?.get(domain)
  if (cached) return cached

  let mx: { exchange: string }[] = []
  let mxErrorCode: string | null = null
  try {
    mx = await resolveMx(domain)
  } catch (err) {
    mxErrorCode = (err as NodeJS.ErrnoException)?.code ?? 'EUNKNOWN'
  }

  let aCount = 0
  let aErrorCode: string | null = null
  if (mx.length === 0 || mxErrorCode === 'ENODATA') {
    try {
      const a = await resolve4(domain)
      aCount = a.length
    } catch (err) {
      aErrorCode = (err as NodeJS.ErrnoException)?.code ?? 'EUNKNOWN'
    }
  }

  const verdict = classifyDnsOutcome({ mx, mxErrorCode, aCount, aErrorCode })
  cache?.set(domain, verdict)
  return verdict
}

type SuppressionRow = { email: string; reason?: string; status?: string; created: number }

const SUPPRESSION_LISTS = ['bounces', 'blocks', 'invalid_emails'] as const

/**
 * Fetches all three SendGrid suppression lists and merges them into a single
 * `Map<lowercased email, DeliverabilityVerdict>`. Unconfigured is NOT an
 * error here — the DNS signal still works standalone, so an empty Map is
 * returned rather than throwing. Each list is fetched in its own try/catch:
 * one failing endpoint degrades to "no suppression data for this list",
 * never aborts the whole refresh. Never logs the key or the Authorization
 * header in any diagnostic.
 */
export async function fetchSendGridSuppressions(): Promise<Map<string, DeliverabilityVerdict>> {
  const result = new Map<string, DeliverabilityVerdict>()
  const key = sendGridApiKey()
  if (!key) return result

  for (const list of SUPPRESSION_LISTS) {
    try {
      const res = await fetch(`https://api.sendgrid.com/v3/suppression/${list}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) continue
      const rows = (await res.json()) as SuppressionRow[]
      for (const row of rows) {
        if (!row.email) continue
        result.set(
          row.email.toLowerCase(),
          classifySuppression({ list, status: row.status, reason: row.reason }),
        )
      }
    } catch {
      // This one list's data is unavailable — continue with the others.
    }
  }
  return result
}

export type RefreshCounts = {
  checked: number
  undeliverable: number
  unknown: number
  changed: number
}

/**
 * Refreshes every user's deliverability verdict. Persists ONLY when the
 * merged verdict is a real true/false — an unknown verdict (transient DNS
 * failure) leaves the existing row untouched, so one bad resolver run can
 * never wipe out good data. Per-domain DNS memoization keeps the live
 * table's ~21 users across ~4 domains to 4 lookups, not 21. Every per-user
 * body is wrapped so one bad row can't abort the batch.
 */
export async function refreshAllUsersDeliverability(): Promise<RefreshCounts> {
  const rows = await db.select({ id: users.id, email: users.email }).from(users)
  const suppressions = await fetchSendGridSuppressions()
  const dnsCache: DnsProbeCache = new Map()

  const counts: RefreshCounts = { checked: 0, undeliverable: 0, unknown: 0, changed: 0 }

  for (const row of rows) {
    counts.checked += 1
    try {
      const domain = emailDomain(row.email)
      let verdict: DeliverabilityVerdict
      if (domain === null) {
        verdict = { deliverable: false, reason: 'address has no valid domain part' }
      } else {
        const dnsVerdict = await probeDomainDns(domain, dnsCache)
        const suppressionVerdict = suppressions.get(row.email.toLowerCase()) ?? null
        verdict = mergeVerdicts(dnsVerdict, suppressionVerdict)
      }

      if (verdict.deliverable === null) {
        counts.unknown += 1
        continue
      }

      if (verdict.deliverable === false) counts.undeliverable += 1

      await db
        .update(users)
        .set({
          emailDeliverable: verdict.deliverable,
          emailUndeliverableReason: verdict.deliverable ? null : verdict.reason,
          emailCheckedAt: sql`now()`,
        })
        .where(eq(users.id, row.id))
      counts.changed += 1
    } catch {
      // One bad row must never abort the whole batch — it simply isn't
      // updated this run and will be retried on the next scheduled pass.
    }
  }

  return counts
}
