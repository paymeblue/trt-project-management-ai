import { describe, it, expect, afterEach, vi } from 'vitest'
import { escapeHtml, escapeAttr, absoluteUrl, renderBrandedEmail } from '@/lib/email-layout'

describe('escapeHtml', () => {
  it('escapes &, <, > for a mixed string', () => {
    expect(escapeHtml('Tom & Jerry <b>')).toBe('Tom &amp; Jerry &lt;b&gt;')
  })

  it('escapes & first so entities are not double-escaped', () => {
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves a plain alphanumeric string byte-identical', () => {
    expect(escapeHtml('Acme Villa')).toBe('Acme Villa')
  })

  it('coerces null/undefined safely to empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('escapeAttr', () => {
  it('escapes the same entity set as escapeHtml', () => {
    expect(escapeAttr('a "b" & <c>')).toBe('a &quot;b&quot; &amp; &lt;c&gt;')
  })
})

describe('absoluteUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('joins a root-relative path with APP_URL', () => {
    vi.stubEnv('APP_URL', 'https://trt.example.com')
    expect(absoluteUrl('/calls/abc')).toBe('https://trt.example.com/calls/abc')
  })

  it('does not produce a double slash when APP_URL has a trailing slash', () => {
    vi.stubEnv('APP_URL', 'https://trt.example.com/')
    expect(absoluteUrl('/calls/abc')).toBe('https://trt.example.com/calls/abc')
  })

  it('throws on a path that is not absolute-from-root and not already an absolute http(s) URL', () => {
    expect(() => absoluteUrl('calls/abc')).toThrow(/relative/)
  })

  it('passes an already-absolute https URL through unchanged', () => {
    expect(absoluteUrl('https://example.com/verify?token=abc123')).toBe(
      'https://example.com/verify?token=abc123',
    )
  })

  it('rejects a non-http(s) scheme', () => {
    expect(() => absoluteUrl('javascript:alert(1)')).toThrow()
  })
})

describe('renderBrandedEmail', () => {
  it('produces a table-based branded shell with the expected structural markers', () => {
    const { html } = renderBrandedEmail({
      preheader: 'You have an update',
      heading: 'Hello there',
      paragraphs: ['First paragraph.'],
    })
    expect(html).toContain('<!DOCTYPE')
    expect(html).toContain('role="presentation"')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('#f97316')
    expect(html).toContain('TRT ARREDO')
    expect(html).toContain('You have an update')
    expect(html).toContain('First paragraph.')
    expect(html).toContain('You are receiving this because you have a TRT PM account.')
  })

  it('contains no <style> block, no flexbox/grid, no <svg, no remote <img', () => {
    const { html } = renderBrandedEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: ['body'],
    })
    expect(html).not.toMatch(/<style/i)
    expect(html).not.toMatch(/display:\s*flex/i)
    expect(html).not.toMatch(/display:\s*grid/i)
    expect(html).not.toMatch(/<svg/i)
    expect(html).not.toMatch(/<img/i)
  })

  it('emits a CTA button with the given href and an mso VML fallback when cta is provided', () => {
    const { html } = renderBrandedEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: ['body'],
      cta: { label: 'Open TRT PM', url: 'https://trt.example.com/x' },
    })
    expect(html).toMatch(/<a[^>]+href="https:\/\/trt\.example\.com\/x"/)
    expect(html).toContain('<!--[if mso]>')
    expect(html).toContain('v:roundrect')
  })

  it('emits no button markup when cta is omitted', () => {
    const { html } = renderBrandedEmail({ preheader: 'p', heading: 'h', paragraphs: ['body'] })
    expect(html).not.toContain('v:roundrect')
    expect(html).not.toMatch(/role="presentation"[^>]*>\s*<tr>\s*<td[^>]*background-color:#f97316/)
  })

  it('never contains the uppercase string PAST (guards projectClosedOutEmail assertion)', () => {
    const { html } = renderBrandedEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: ['body text with no forbidden words'],
    })
    expect(html).not.toMatch(/PAST/)
  })

  it('returns plaintext containing each paragraph, and the cta label + raw url when present', () => {
    const { text } = renderBrandedEmail({
      preheader: 'p',
      heading: 'Heading here',
      paragraphs: ['Plain paragraph text.'],
      cta: { label: 'Join the call', url: 'https://trt.example.com/calls/1' },
    })
    expect(text).toContain('Heading here')
    expect(text).toContain('Plain paragraph text.')
    expect(text).toContain('Join the call')
    expect(text).toContain('https://trt.example.com/calls/1')
  })

  it('does not re-escape paragraph content — passes <strong> through so templates can bold', () => {
    const { html } = renderBrandedEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: ['<strong>bold text</strong>'],
    })
    expect(html).toContain('<strong>bold text</strong>')
  })
})
