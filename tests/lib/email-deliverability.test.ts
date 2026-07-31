import { describe, it, expect } from 'vitest'
import {
  emailDomain,
  classifyDnsOutcome,
  classifySuppression,
  mergeVerdicts,
  shouldShowDeliverabilityBanner,
  TRANSIENT_DNS_CODES,
} from '@/lib/email-deliverability'

// No vi.mock('server-only') needed — this module has no imports at all.

describe('emailDomain', () => {
  it('extracts, lowercases, and trims the domain', () => {
    expect(emailDomain('a@trtarredo.demo')).toBe('trtarredo.demo')
    expect(emailDomain('  A@TRTARREDO.DEMO  ')).toBe('trtarredo.demo')
  })

  it('returns null for no @', () => {
    expect(emailDomain('nodomain')).toBeNull()
  })

  it('returns null for empty local part', () => {
    expect(emailDomain('@example.com')).toBeNull()
  })

  it('returns null for empty domain part', () => {
    expect(emailDomain('user@')).toBeNull()
  })
})

describe('classifyDnsOutcome', () => {
  it('non-empty MX → deliverable', () => {
    const result = classifyDnsOutcome({
      mx: [{ exchange: 'mx1.gmail.com' }],
      mxErrorCode: null,
      aCount: 0,
      aErrorCode: null,
    })
    expect(result).toEqual({ deliverable: true, reason: null })
  })

  it('null MX record (RFC 7505) → undeliverable with the RFC 7505 reason', () => {
    const result = classifyDnsOutcome({
      mx: [{ exchange: '.' }],
      mxErrorCode: null,
      aCount: 0,
      aErrorCode: null,
    })
    expect(result.deliverable).toBe(false)
    expect(result.reason).toMatch(/RFC 7505/)
  })

  it('ENOTFOUND (NXDOMAIN) on MX → undeliverable — the @trtarredo.demo case', () => {
    const result = classifyDnsOutcome({
      mx: [],
      mxErrorCode: 'ENOTFOUND',
      aCount: 0,
      aErrorCode: 'ENOTFOUND',
    })
    expect(result.deliverable).toBe(false)
    expect(result.reason).toMatch(/NXDOMAIN/)
  })

  it('no MX but a valid A record → deliverable (RFC 5321 §5.1 implicit MX)', () => {
    const result = classifyDnsOutcome({
      mx: [],
      mxErrorCode: 'ENODATA',
      aCount: 1,
      aErrorCode: null,
    })
    expect(result).toEqual({ deliverable: true, reason: null })
  })

  it('no MX and no A record → undeliverable', () => {
    const result = classifyDnsOutcome({
      mx: [],
      mxErrorCode: 'ENODATA',
      aCount: 0,
      aErrorCode: 'ENODATA',
    })
    expect(result.deliverable).toBe(false)
    expect(result.reason).toMatch(/no MX and no A record/)
  })

  // THE MOST IMPORTANT CASE IN THE FILE: a transient resolver failure must
  // NEVER be classified as undeliverable. Every transient code is exercised
  // explicitly, on both the MX and the A lookup.
  describe('transient DNS codes never produce a false "undeliverable" (deliverable: null)', () => {
    for (const code of TRANSIENT_DNS_CODES) {
      it(`MX lookup failing with ${code} → deliverable: null (unknown)`, () => {
        const result = classifyDnsOutcome({
          mx: [],
          mxErrorCode: code,
          aCount: 0,
          aErrorCode: null,
        })
        expect(result.deliverable).toBeNull()
      })

      it(`A lookup failing with ${code} (MX empty) → deliverable: null (unknown)`, () => {
        const result = classifyDnsOutcome({
          mx: [],
          mxErrorCode: 'ENODATA',
          aCount: 0,
          aErrorCode: code,
        })
        expect(result.deliverable).toBeNull()
      })
    }

    it('an unrecognised MX error code also falls back to unknown, not undeliverable', () => {
      const result = classifyDnsOutcome({
        mx: [],
        mxErrorCode: 'ESOMETHINGWEIRD',
        aCount: 0,
        aErrorCode: null,
      })
      expect(result).toEqual({ deliverable: null, reason: null })
    })
  })
})

describe('classifySuppression', () => {
  it('is always deliverable: false, with a "<list>: <reason>" string', () => {
    const result = classifySuppression({
      list: 'blocks',
      status: '5.7.7',
      reason: '554 5.7.7 Email policy violation detected',
    })
    expect(result).toEqual({
      deliverable: false,
      reason: 'blocks: 554 5.7.7 Email policy violation detected',
    })
  })

  it('falls back to status when reason is missing', () => {
    const result = classifySuppression({ list: 'bounces', status: 'bounced' })
    expect(result.reason).toBe('bounces: bounced')
  })

  it('falls back to a generic message when both reason and status are missing', () => {
    const result = classifySuppression({ list: 'invalid_emails' })
    expect(result.reason).toBe('invalid_emails: listed by SendGrid')
  })
})

describe('mergeVerdicts', () => {
  it('a suppression verdict wins even over a deliverable DNS verdict', () => {
    const dns = { deliverable: true, reason: null }
    const suppression = { deliverable: false, reason: 'blocks: policy violation' }
    expect(mergeVerdicts(dns, suppression)).toBe(suppression)
  })

  it('passes the DNS verdict through unchanged when there is no suppression record', () => {
    const dns = { deliverable: true, reason: null }
    expect(mergeVerdicts(dns, null)).toBe(dns)
  })
})

describe('shouldShowDeliverabilityBanner', () => {
  it('shows only when deliverable is false and not dismissed', () => {
    expect(shouldShowDeliverabilityBanner({ emailDeliverable: false, dismissed: false })).toBe(true)
  })

  it('hides when dismissed', () => {
    expect(shouldShowDeliverabilityBanner({ emailDeliverable: false, dismissed: true })).toBe(false)
  })

  it('hides when deliverable is true', () => {
    expect(shouldShowDeliverabilityBanner({ emailDeliverable: true, dismissed: false })).toBe(false)
  })

  // Silence is correct for unknown: a scary banner on a transient resolver
  // failure is worse than no banner at all.
  it('hides when deliverable is null (unknown / never checked)', () => {
    expect(shouldShowDeliverabilityBanner({ emailDeliverable: null, dismissed: false })).toBe(false)
  })
})
