/**
 * On-demand deliverability check + live verification harness.
 *
 *   npm run email:deliverability              # classify + PERSIST verdicts
 *   npm run email:deliverability -- --dry-run # classify + print only, no writes
 *
 * Prints a per-user table (email, verdict, reason) plus summary counts. The
 * dry-run mode reuses the same DNS probe + suppression fetch as the real
 * scheduled refresh (lib/email-deliverability-refresh.ts) but skips the DB
 * write, so it's safe to run against the live table at any time.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// `server-only` throws outside Next's build; this IS a trusted server-side
// CLI entrypoint. Same shim as scripts/verify-email.ts — must run before any
// server-only-marked module is required.
type Loader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NodeModule = require('node:module') as { _load: Loader }
const originalLoad = NodeModule._load
NodeModule._load = function (this: unknown, request: string, ...rest: [unknown, boolean]) {
  if (request === 'server-only') return {}
  return originalLoad.apply(this, [request, ...rest])
} as Loader

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../db') as typeof import('../db')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { users } = require('../db/schema') as typeof import('../db/schema')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const refresh = require('../lib/email-deliverability-refresh') as typeof import('../lib/email-deliverability-refresh')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const classifier = require('../lib/email-deliverability') as typeof import('../lib/email-deliverability')
type DeliverabilityVerdict = import('../lib/email-deliverability').DeliverabilityVerdict

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(`TRT PM — email deliverability check${isDryRun ? ' (dry run)' : ''}`)
  console.log('')

  const rows = await db.select({ id: users.id, email: users.email }).from(users)
  const suppressions = await refresh.fetchSendGridSuppressions()
  const dnsCache = new Map<string, DeliverabilityVerdict>()

  let undeliverable = 0
  let unknown = 0

  for (const row of rows) {
    const domain = classifier.emailDomain(row.email)
    let verdict: DeliverabilityVerdict
    if (domain === null) {
      verdict = { deliverable: false, reason: 'address has no valid domain part' }
    } else {
      const dnsVerdict = await refresh.probeDomainDns(domain, dnsCache)
      const suppressionVerdict = suppressions.get(row.email.toLowerCase()) ?? null
      verdict = classifier.mergeVerdicts(dnsVerdict, suppressionVerdict)
    }

    const label =
      verdict.deliverable === true ? 'deliverable' : verdict.deliverable === false ? 'UNDELIVERABLE' : 'unknown'
    if (verdict.deliverable === false) undeliverable += 1
    if (verdict.deliverable === null) unknown += 1

    console.log(`  ${label.padEnd(13)} ${row.email}${verdict.reason ? `  — ${verdict.reason}` : ''}`)
  }

  console.log('')
  console.log(`checked: ${rows.length}  undeliverable: ${undeliverable}  unknown: ${unknown}`)

  if (isDryRun) {
    console.log('')
    console.log('Dry run — nothing was written.')
    return
  }

  console.log('')
  console.log('Persisting verdicts …')
  const counts = await refresh.refreshAllUsersDeliverability()
  console.log(
    `Done. checked=${counts.checked} undeliverable=${counts.undeliverable} unknown=${counts.unknown} changed=${counts.changed}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
