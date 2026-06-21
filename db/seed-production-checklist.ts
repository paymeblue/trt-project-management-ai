/**
 * Seed the Site PM "Project Production Checklist" (Kitchen / Closet / Toilet
 * Vanity / TV Units) digitised from the paper form.
 *
 * Run via: npx tsx db/seed-production-checklist.ts
 *
 * Idempotent: deletes the existing `production` definition (and its items via
 * cascade-free manual delete) before reinserting, so it can be re-run safely.
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, inArray } from 'drizzle-orm'
import * as schema from './schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })
const { checklistDefinitions, checklistTemplateItems } = schema

const SLUG = 'production'
const NAME = 'Project Production Checklist'

// An item is a YES/NO line by default, or a free-text capture field via T().
type Item = { label: string; type: 'radio' | 'text'; help?: string }
const Y = (label: string, help?: string): Item => ({ label, type: 'radio', help })
const T = (label: string, help?: string): Item => ({ label, type: 'text', help })

type Section = { title: string; items: Item[] }

// ── Reusable category templates ─────────────────────────────────────────────
const HANDLE_NOTE =
  'Handles go on the right swing door; one-door boxes either way; ~100cm from the door bottom; confirm hinge type fits.'

const glassDoors = (): Item[] => [
  Y('Confirm all dimensions for glass/mirror doors'),
  Y('Glass and mirror doors are produced and in good condition'),
  T('Number of glass doors'),
  T('Number of mirror doors'),
  Y('Profile specification as indicated in drawing'),
  Y('Glass/mirror door hinges confirmed'),
  Y('Hinge position does not interfere with shelves'),
  Y('Glass/mirror door handle positions checked', HANDLE_NOTE),
]

const doors = (kitchen = false): Item[] => [
  Y('All door dimensions accurate and same material specification as drawing'),
  Y('All drawer faces are the same size and material specification'),
  T('Total number of doors (matches drawing)'),
  T('Total number of drawers (matches drawing)'),
  Y('Door material is as specified on the drawing'),
  Y('Edging of doors/drawers is good quality'),
  ...(kitchen
    ? [
        Y('Door openings are as specified (pull-out or hinged)'),
        Y('Uninstalled doors are accurate dimensions, colours and complete', 'Fridge doors and any other uninstalled accessory doors.'),
      ]
    : []),
]

const architraves = (): Item[] => [
  Y('Architraves are complete'),
  Y('All architraves are the same size as indicated in drawing'),
  T('Quantity of architraves'),
  Y('No dents and edged properly'),
  Y('Leaping boards for architraves provided'),
]

const panels = (island = false): Item[] => [
  Y('Side panels — edged properly, correct dimensions and quantity'),
  Y('Top panels — edged properly, correct dimensions and quantity'),
  Y('Under panels — edged properly, correct dimensions and quantity'),
  Y('Ribbed panels — edged properly, correct dimensions and quantity'),
  ...(island ? [Y('Island under panels — edged properly, correct dimensions and quantity')] : []),
  Y('Plain/other panels — edged properly, correct dimensions and quantity'),
  Y('Chamfered wood provided where needed for panel installation'),
  Y('Panel joints align properly and fit'),
]

const accessories = (): Item[] => [
  Y('All accessories indicated in the drawing are available (dimension, specification, packaging)'),
  Y('Metal legs (if indicated) — correct quantity and size'),
  Y('Floating shelves — hangers present (quantity & size)'),
  Y('Glass tops — correct quantity & size'),
  Y('Upholstery — correct quantity & size'),
  T('Other accessories (specify)'),
]

const lightsNote =
  'All lights tested and in good condition before receiving from materials dept. Provide 1 extra light per space for contingency. All lights same reflection shade (warm or pure white).'

const mirrors = (): Item[] => [
  Y('All mirror dimensions are as indicated (if provided)'),
  T('Lit mirror: 10cm boards for wall bracings — number of bracings'),
  T('Lit mirror: colour of bracings'),
  T('Rope lights & adaptors for lit mirrors — number of lights'),
  T('Rope lights & adaptors for lit mirrors — number of adaptors', lightsNote),
  Y('For mirrors not lit, back boards are provided accordingly'),
  T('Mirror back board material & size'),
]

const spaceOverview = (label: string): Item[] => [
  T(`${label}: tag / name`),
  T('Number of boxes'),
  T('Number of glass doors'),
  T('Number of packs'),
]

const boxesCommon = (): Item[] => [
  Y('Using a tape, confirm all box dimensions as indicated in drawing'),
  Y('All boxes well coupled'),
  Y('All shelves in place'),
  T('Total number of boxes'),
  Y('Dimensions of boxes match drawings'),
  Y('All back covers are as indicated', 'Wooden back covers (same colour as box material) for open shelves and glass-door boxes.'),
  Y('All boxes with light grooves are as indicated on drawing'),
  Y('All strip lights are the same size as the grooves'),
]

// ── Spaces ───────────────────────────────────────────────────────────────────
const sections: Section[] = [
  // Project / PMO header
  {
    title: 'Project details',
    items: [
      T('Project Manager'),
      T('Project Name'),
      T('Installation officer'),
      T('Project location'),
      T('Project in-date'),
      T('Project out-date'),
      Y('Submitted to PMO'),
    ],
  },

  // KITCHEN
  { title: 'Kitchen · Overview', items: spaceOverview('Kitchen') },
  {
    title: 'Kitchen · Boxes',
    items: [
      ...boxesCommon(),
      Y('All legra boxes and other drawers are as indicated in drawings and in place'),
      Y('Profiles used are as indicated and complete'),
      Y('All upper-unit profiles are installed'),
      Y('Kitchen base dimension matches drawing (12cm or 15cm)'),
      Y('All openings for freestanding appliances fit', 'Check appliance details carefully (e.g. dishwasher, washing machine).'),
      T('Freestanding appliance — name, size & opening provided'),
      Y('All openings for inbuilt appliances fit'),
      T('Inbuilt appliance(s) — name, size & opening provided'),
    ],
  },
  { title: 'Kitchen · Doors', items: doors(true) },
  { title: 'Kitchen · Glass Doors', items: glassDoors() },
  {
    title: 'Kitchen · Base',
    items: [
      Y('Base dimensions L x H confirmed (12cm or 15cm)'),
      Y('All kitchen legs complete (4 legs per box)'),
      T('Total number of legs'),
      T('Leg size'),
    ],
  },
  {
    title: 'Kitchen · Lit',
    items: [
      T('Lit profiles — number of lights'),
      T('Lit profiles — number of adaptors'),
      T('Under-cabinet lights — number of lights'),
      T('Under-cabinet lights — number of adaptors'),
      Y('Grooved boards: groove and light provided are the same'),
      T('Grooved board lights & adaptors — number of lights'),
      T('Grooved board lights & adaptors — number of adaptors', lightsNote),
    ],
  },
  { title: 'Kitchen · Architraves', items: architraves() },
  { title: 'Kitchen · Panels', items: panels(true) },
  { title: 'Kitchen · Accessories', items: accessories() },
  {
    title: 'Kitchen · Slabs',
    items: [
      Y('Slabs for kitchen space are as indicated/approved'),
      T('Slab name/code'),
      T('Number of sheets'),
      T('Slab size'),
      Y('Backsplash slab provided (if applicable)'),
      T('Backsplash slab name/code, sheets & size'),
    ],
  },

  // CLOSET
  { title: 'Closet · Overview', items: spaceOverview('Closet') },
  {
    title: 'Closet · Boxes',
    items: [
      ...boxesCommon(),
      Y('All hangings are as indicated in drawings'),
      Y('All internal drawers in place as indicated on drawing'),
      Y('For detached drawers, all drawer boxes are available, coupled or materials provided'),
    ],
  },
  { title: 'Closet · Doors', items: doors() },
  { title: 'Closet · Glass Doors', items: glassDoors() },
  {
    title: 'Closet · Base & Carcass',
    items: [
      Y('Base dimensions L x H confirmed'),
      Y('8cm carcass materials available'),
      Y('Full-length base x 30cm available'),
      Y('Full-length base x 20cm available'),
      Y('Full-length sides x 30cm available'),
      Y('Full-length sides x 20cm available'),
    ],
  },
  {
    title: 'Closet · Lit',
    items: [
      Y('Grooved boards: groove and light provided are the same'),
      T('Grooved board lights & adaptors — number of lights'),
      T('Grooved board lights & adaptors — number of adaptors'),
      T('Lit closets: rope lights — number of lights'),
      T('Lit closets: rope lights — number of adaptors', lightsNote),
    ],
  },
  { title: 'Closet · Architraves', items: architraves() },
  { title: 'Closet · Panels', items: panels() },
  { title: 'Closet · Accessories', items: accessories() },

  // TOILET VANITY
  { title: 'Toilet Vanity · Overview', items: spaceOverview('Vanity') },
  {
    title: 'Toilet Vanity · Boxes',
    items: [
      ...boxesCommon(),
      Y('All drawers in place as indicated (piping openings created as indicated in drawing)'),
      Y('All boxes with profiles are cut correctly to accommodate the profiles, and profiles are available'),
    ],
  },
  { title: 'Toilet Vanity · Doors', items: doors() },
  { title: 'Toilet Vanity · Glass Doors', items: glassDoors() },
  {
    title: 'Toilet Vanity · Base',
    items: [
      Y('Base dimensions L x H confirmed'),
      Y('Base carcass materials available (kitchen legs for all vanities installed in bathrooms)'),
      Y('For suspended vanities, suspension accessories available and complete (2 clips per box)'),
    ],
  },
  {
    title: 'Toilet Vanity · Lit',
    items: [
      Y('Grooved boards: groove and light provided are the same'),
      T('Grooved board lights & adaptors — number of lights'),
      T('Grooved board lights & adaptors — number of adaptors'),
    ],
  },
  { title: 'Toilet Vanity · Mirrors', items: mirrors() },
  { title: 'Toilet Vanity · Architraves', items: architraves() },
  { title: 'Toilet Vanity · Panels', items: panels() },
  { title: 'Toilet Vanity · Accessories', items: accessories() },

  // TV UNITS
  { title: 'TV Units · Overview', items: spaceOverview('TV Unit') },
  {
    title: 'TV Units · Boxes',
    items: [
      ...boxesCommon(),
      Y('All drawers in place as indicated (piping openings created as indicated in drawing)'),
      Y('All boxes with profiles are cut correctly to accommodate the profiles, and profiles are available'),
    ],
  },
  { title: 'TV Units · Doors', items: doors() },
  { title: 'TV Units · Glass Doors', items: glassDoors() },
  {
    title: 'TV Units · Base',
    items: [
      Y('Base dimensions L x H confirmed'),
      Y('Base carcass materials available'),
      Y('For suspended units, suspension accessories available and complete (2 clips per box)'),
    ],
  },
  {
    title: 'TV Units · Lit',
    items: [
      Y('Grooved boards: groove and light provided are the same'),
      T('Grooved board lights & adaptors — number of lights'),
      T('Grooved board lights & adaptors — number of adaptors'),
    ],
  },
  { title: 'TV Units · Mirrors', items: mirrors() },
  { title: 'TV Units · Architraves', items: architraves() },
  { title: 'TV Units · Panels', items: panels() },
  { title: 'TV Units · Accessories', items: accessories() },
]

async function main() {
  console.log(`Seeding "${NAME}"...`)

  // Idempotent reset: remove existing definition + its items.
  const existing = await db
    .select({ id: checklistDefinitions.id })
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.slug, SLUG))
  if (existing.length > 0) {
    const ids = existing.map((e) => e.id)
    await db.delete(checklistTemplateItems).where(inArray(checklistTemplateItems.definitionId, ids))
    await db.delete(checklistDefinitions).where(inArray(checklistDefinitions.id, ids))
    console.log('  Cleared previous production checklist.')
  }

  const [def] = await db
    .insert(checklistDefinitions)
    .values({ slug: SLUG, name: NAME, targetRole: 'site_pm', isActive: true })
    .returning({ id: checklistDefinitions.id })

  let total = 0
  for (let s = 0; s < sections.length; s++) {
    const section = sections[s]
    for (let i = 0; i < section.items.length; i++) {
      const item = section.items[i]
      await db.insert(checklistTemplateItems).values({
        definitionId: def.id,
        step: s + 1,
        sectionTitle: section.title,
        sortOrder: i + 1,
        label: item.label,
        itemType: item.type,
        responseOptions: 'yes_no_na',
        isPhotoAllowed: true,
        isPhotoRequired: false,
        helpText: item.help ?? null,
        isActive: true,
      })
      total++
    }
  }

  console.log(`  + ${sections.length} sections, ${total} items inserted.`)
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
