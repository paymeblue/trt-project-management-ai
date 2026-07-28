import { describe, it, expect } from 'vitest'
import { isImageAsset, imageAssetsOnly, type AuditAsset } from '@/lib/audit-assets'

describe('isImageAsset', () => {
  it('accepts data:image/png', () => {
    expect(isImageAsset('data:image/png;base64,AAA')).toBe(true)
  })

  it('accepts data:image/jpeg', () => {
    expect(isImageAsset('data:image/jpeg;base64,AAA')).toBe(true)
  })

  it('accepts data:image/svg+xml (still only ever rendered as an <img> src, never navigated to)', () => {
    expect(isImageAsset('data:image/svg+xml;base64,AAA')).toBe(true)
  })

  it('rejects data:application/pdf', () => {
    expect(isImageAsset('data:application/pdf;base64,AAA')).toBe(false)
  })

  it('rejects data:text/html;base64', () => {
    expect(isImageAsset('data:text/html;base64,AAA')).toBe(false)
  })

  it('rejects data:text/html with an inline script payload', () => {
    expect(isImageAsset('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects an uppercase-prefix lookalike (gate is case-sensitive, no lowercasing)', () => {
    expect(isImageAsset('DATA:IMAGE/PNG;base64,AAA')).toBe(false)
  })

  it('rejects a leading-whitespace lookalike (gate does not trim)', () => {
    expect(isImageAsset(' data:image/png;base64,AAA')).toBe(false)
  })

  it('rejects a plain https URL', () => {
    expect(isImageAsset('https://evil.example/x.png')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isImageAsset('')).toBe(false)
  })

  it('rejects null', () => {
    expect(isImageAsset(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isImageAsset(undefined)).toBe(false)
  })
})

describe('imageAssetsOnly', () => {
  it('returns only entries whose dataUrl passes isImageAsset, preserving input order', () => {
    const assets: AuditAsset[] = [
      { dataUrl: 'data:image/png;base64,AAA', label: 'a' },
      { dataUrl: 'data:application/pdf;base64,AAA', label: 'b' },
      { dataUrl: 'data:image/jpeg;base64,CCC', label: 'c' },
      { dataUrl: 'data:text/html;base64,DDD', label: 'd' },
    ]
    expect(imageAssetsOnly(assets)).toEqual([
      { dataUrl: 'data:image/png;base64,AAA', label: 'a' },
      { dataUrl: 'data:image/jpeg;base64,CCC', label: 'c' },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(imageAssetsOnly([])).toEqual([])
  })
})
