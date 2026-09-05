import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import manifest from '@/app/manifest'

describe('PWA manifest installability contract', () => {
  const m = manifest()

  it('is standalone with start_url and scope both root', () => {
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
  })

  it('has non-empty name and a short short_name', () => {
    expect(m.name).toBeTruthy()
    expect(m.short_name).toBeTruthy()
    expect((m.short_name as string).length).toBeLessThanOrEqual(12)
  })

  it('has valid hex theme_color and background_color', () => {
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('includes at least one 192x192 and one 512x512 icon with purpose any', () => {
    const icons = m.icons ?? []
    const has192Any = icons.some(
      (i) => i.sizes === '192x192' && (i.purpose ?? 'any').includes('any')
    )
    const has512Any = icons.some(
      (i) => i.sizes === '512x512' && (i.purpose ?? 'any').includes('any')
    )
    expect(has192Any).toBe(true)
    expect(has512Any).toBe(true)
  })

  it('includes at least one maskable icon', () => {
    const icons = m.icons ?? []
    const hasMaskable = icons.some((i) => (i.purpose ?? '').includes('maskable'))
    expect(hasMaskable).toBe(true)
  })

  it('every icon src resolves to a file that exists on disk', () => {
    const icons = m.icons ?? []
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      const filePath = path.join(process.cwd(), 'public', icon.src)
      expect(existsSync(filePath), `missing icon file: ${icon.src}`).toBe(true)
    }
  })
})
