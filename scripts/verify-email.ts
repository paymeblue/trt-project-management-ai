/**
 * Email configuration checker + optional live send.
 *
 *   npm run email:verify                    # config check only, sends nothing
 *   npm run email:verify -- --to=me@x.com   # also sends one real branded email
 *
 * Exists because every email in this app is BEST-EFFORT by design: a rejected
 * send can never fail the workflow step or call it reports on, so a
 * misconfiguration (unset key, unverified sender) is invisible from the UI.
 * This is the one place that reports the truth loudly.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// `server-only` throws outside Next's build; this IS a trusted server-side
// CLI entrypoint. Same shim the repo's other verify harnesses use, and it must
// run before lib/email is required.
type Loader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NodeModule = require('node:module') as { _load: Loader }
const originalLoad = NodeModule._load
NodeModule._load = function (this: unknown, request: string, ...rest: [unknown, boolean]) {
  if (request === 'server-only') return {}
  return originalLoad.apply(this, [request, ...rest])
} as Loader

// eslint-disable-next-line @typescript-eslint/no-require-imports
const email = require('../lib/email') as typeof import('../lib/email')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const templates = require('../lib/email-templates') as typeof import('../lib/email-templates')

const toArg = process.argv.find((a) => a.startsWith('--to='))?.slice('--to='.length)

let problems = 0
const fail = (m: string) => {
  problems += 1
  console.log(`  FAIL  ${m}`)
}
const ok = (m: string) => console.log(`  ok    ${m}`)
const warn = (m: string) => console.log(`  warn  ${m}`)

async function main() {
  console.log('TRT PM — email configuration check')
  console.log('')

  const provider = email.activeEmailProvider()
  if (!provider) {
    fail('No transport configured. Set SENDGRID_API_KEY (preferred) or RESEND_API_KEY.')
  } else {
    ok(`Active provider: ${provider}`)
    if (provider === 'resend' && process.env.SENDGRID_API_KEY === '') {
      warn('SENDGRID_API_KEY is present but EMPTY — it is being ignored; Resend is in use.')
    }
  }

  const from = email.EMAIL_FROM
  const parsed = email.parseEmailFrom(from)
  if (!parsed.email.includes('@')) {
    fail(`EMAIL_FROM does not contain a usable address: ${from}`)
  } else {
    ok(`EMAIL_FROM parses to ${JSON.stringify(parsed)}`)
  }
  if (provider === 'sendgrid' && /resend\.dev$/i.test(parsed.email)) {
    fail(
      `EMAIL_FROM is still the Resend sandbox address (${parsed.email}). SendGrid rejects any sender it has not verified — ` +
        'verify an address (or authenticate your domain) and set EMAIL_FROM to it.',
    )
  }

  const appUrl = process.env.APP_URL ?? ''
  if (!appUrl) {
    fail('APP_URL is unset — every action button in an email needs an absolute URL.')
  } else if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    warn(`APP_URL is ${appUrl} — action buttons will point at localhost and be dead for real recipients.`)
  } else {
    ok(`APP_URL is ${appUrl}`)
  }

  console.log('')

  if (!toArg) {
    console.log('No --to=<address> supplied, so nothing was sent.')
  } else if (problems > 0) {
    console.log(`Refusing to send: ${problems} configuration problem(s) above.`)
  } else {
    console.log(`Sending one live test email to ${toArg} …`)
    const { subject, html, text } = templates.stepTurnEmail({
      projectName: 'Email configuration test',
      stepLabel: 'Delivery check',
    })
    const result = await email.sendEmail({ to: toArg, subject, html, text })
    if (result.error) {
      problems += 1
      console.log(`  FAIL  ${result.error.name}: ${result.error.message}`)
      email.logEmailFailure('verify-email', result)
    } else {
      console.log(`  ok    accepted by ${email.activeEmailProvider()} (id: ${result.data?.id ?? 'n/a'})`)
      console.log('        Check the inbox — if it never arrives, look at the provider dashboard for a bounce/block.')
    }
  }

  console.log('')
  console.log(problems === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${problems} problem(s))`)
  process.exit(problems === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
