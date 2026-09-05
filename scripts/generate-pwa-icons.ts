/**
 * One-shot PWA icon rasterizer.
 *
 *   npm run pwa:icons
 *
 * Reads app/icon.svg (the 40x40 TRT mark) and emits the PNG set the manifest
 * (app/manifest.ts) and Next's apple-icon file convention need:
 *   - public/icons/icon-192.png            192x192, transparent, no padding
 *   - public/icons/icon-512.png            512x512, transparent, no padding
 *   - public/icons/icon-maskable-512.png   512x512, opaque #9d4300, mark at 80%
 *   - app/apple-icon.png                   180x180, opaque #9d4300 (iOS ignores alpha)
 *
 * `sharp` is not a project dependency — it is vendored by Next for image
 * optimization and is already resolvable in node_modules. This script is a
 * dev-time-only consumer; do not add sharp to package.json dependencies.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp')
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SVG_PATH = path.join(ROOT, 'app/icon.svg')
const MASKABLE_BG = '#9d4300'

async function main() {
  const svgBuffer = readFileSync(SVG_PATH)

  mkdirSync(path.join(ROOT, 'public/icons'), { recursive: true })

  // Transparent, unpadded — for the two `purpose: 'any'` manifest entries.
  await sharp(svgBuffer, { density: 384 })
    .resize(192, 192)
    .png()
    .toFile(path.join(ROOT, 'public/icons/icon-192.png'))

  await sharp(svgBuffer, { density: 384 })
    .resize(512, 512)
    .png()
    .toFile(path.join(ROOT, 'public/icons/icon-512.png'))

  // Maskable: mark scaled to 80% (410px) centred on an opaque background so
  // Android's circular/rounded safe-zone crop can never clip the mark.
  const markSize = 410
  const pad = Math.round((512 - markSize) / 2) // 51
  const mark = await sharp(svgBuffer, { density: 384 }).resize(markSize, markSize).toBuffer()

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: MASKABLE_BG,
    },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .flatten({ background: MASKABLE_BG })
    .png()
    .toFile(path.join(ROOT, 'public/icons/icon-maskable-512.png'))

  // iOS home-screen icon: opaque, no alpha (iOS renders transparency as black).
  await sharp(svgBuffer, { density: 384 })
    .resize(180, 180)
    .flatten({ background: MASKABLE_BG })
    .png()
    .toFile(path.join(ROOT, 'app/apple-icon.png'))

  console.log('Generated PWA icon set:')
  console.log('  public/icons/icon-192.png')
  console.log('  public/icons/icon-512.png')
  console.log('  public/icons/icon-maskable-512.png')
  console.log('  app/apple-icon.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
