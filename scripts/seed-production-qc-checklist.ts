/**
 * Seeds the "Project Production & Quality Control Checklist" from TRT Arredo's
 * paper form (10 numbered sections, Cutting -> ... -> FM/CPO attestation).
 *
 * ONE definition with one `step` per paper section, each carrying the section's
 * own title in `section_title` — that maps the paper form's structure onto the
 * existing multi-step wizard exactly, and keeps the officer's "Checked By /
 * Signature / Date" sign-off per section rather than one at the end.
 *
 *   npx tsx scripts/seed-production-qc-checklist.ts            # dry run
 *   npx tsx scripts/seed-production-qc-checklist.ts --apply
 *
 * Idempotent: re-running replaces this definition's items wholesale, so editing
 * the arrays below and re-applying is the intended way to amend the form.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const db = drizzle(neon(process.env.DATABASE_URL!), { schema })
const { checklistDefinitions, checklistTemplateItems } = schema

const SLUG = 'production_quality_control'
const NAME = 'Project Production & Quality Control Checklist'
const APPLY = process.argv.includes('--apply')

type Item = { label: string; type?: 'radio' | 'text'; photo?: boolean; help?: string }
type Section = { title: string; items: Item[] }

// Sections numbered exactly as the paper form. "(IF APPLICABLE)" sections use
// yes_no_na so a section that does not apply to a project is answered N/A
// rather than left blank or falsely marked complete.
const OPTIONAL_SECTIONS = new Set([3, 4, 6, 7])

const SECTIONS: Section[] = [
  {
    title: 'Project Information',
    items: [
      { label: 'Project Name', type: 'text' },
      { label: 'Client', type: 'text' },
      { label: 'Project Location', type: 'text' },
      { label: 'Production Start Date', type: 'text' },
      { label: 'Installation Date', type: 'text' },
      { label: 'Project Manager', type: 'text' },
      { label: 'Factory Project Supervisor', type: 'text' },
    ],
  },
  {
    title: '1. Cutting Section Checklist',
    items: [
      { label: 'Material matches approved drawing', photo: true },
      { label: 'Material colour and code verified' },
      { label: 'Material thickness verified' },
      { label: 'All box components cut correctly' },
      { label: 'All doors cut correctly' },
      { label: 'All drawer faces cut correctly' },
      { label: 'All shelves cut correctly' },
      { label: 'All panels cut correctly' },
      { label: 'Appliance openings cut correctly' },
      { label: 'Lighting grooves cut correctly' },
      { label: 'Profile grooves cut correctly' },
      { label: 'No chipped edges' },
      { label: 'No damaged boards' },
      { label: 'Dimensions match drawing' },
    ],
  },
  {
    title: '2. Edging Section Checklist',
    items: [
      { label: 'Correct edging colour used' },
      { label: 'Correct edging thickness used' },
      { label: 'All exposed edges covered' },
      { label: 'No edge peeling' },
      { label: 'No glue stains' },
      { label: 'Corners properly finished' },
      { label: 'Edge finish smooth' },
      { label: 'No gaps between edge and board' },
    ],
  },
  {
    title: '3. Spray Section Checklist (if applicable)',
    items: [
      { label: 'Components properly sanded' },
      { label: 'Surface free from defects' },
      { label: 'Correct colour applied' },
      { label: 'Correct finish applied' },
      { label: 'Paint coverage complete' },
      { label: 'Edges fully sprayed' },
      { label: 'No scratches' },
      { label: 'No runs' },
      { label: 'No pinholes' },
      { label: 'Proper curing completed' },
    ],
  },
  {
    title: '4. Glass Section Checklist (if applicable)',
    items: [
      { label: 'Glass dimensions verified' },
      { label: 'Mirror dimensions verified' },
      { label: 'Glass thickness verified' },
      { label: 'Profile specification verified' },
      { label: 'Hinges provided' },
      { label: 'Handles provided' },
      { label: 'No scratches' },
      { label: 'No cracks' },
      { label: 'No chips' },
      { label: 'Proper packaging completed' },
    ],
  },
  {
    title: '5. Coupling / Assembly Checklist',
    items: [
      { label: 'All boxes properly coupled' },
      { label: 'All shelves installed' },
      { label: 'Back covers installed' },
      { label: 'Internal partitions installed' },
      { label: 'Hinges installed' },
      { label: 'Drawer runners installed' },
      { label: 'Legs installed' },
      { label: 'Profiles installed' },
      { label: 'Handles installed' },
      { label: 'Drawer operation confirmed' },
      { label: 'Door operation confirmed' },
      { label: 'Alignment confirmed' },
    ],
  },
  {
    title: '6. Hardwood Section Checklist (if applicable)',
    items: [
      { label: 'Architraves completed' },
      { label: 'Hardwood trims completed' },
      { label: 'Chamfered wood completed' },
      { label: 'Ribbed panels completed' },
      { label: 'Bracing materials completed' },
      { label: 'Proper sanding completed' },
      { label: 'No cracks or splits' },
      { label: 'Correct dimensions verified' },
    ],
  },
  {
    title: '7. Upholstery Section Checklist (if applicable)',
    items: [
      { label: 'Fabric/leather matches the specification' },
      { label: 'Foam density verified' },
      { label: 'Stitching quality approved' },
      { label: 'Cushion dimensions verified' },
      { label: 'No wrinkles' },
      { label: 'No stains' },
      { label: 'No tears' },
      { label: 'Finish approved' },
    ],
  },
  {
    title: '8. Quality Control Checklist',
    items: [
      { label: 'Components match drawing' },
      { label: 'Dimensions verified' },
      { label: 'Material specification verified' },
      { label: 'Quantity verified' },
      { label: 'Accessories complete' },
      { label: 'Lighting tested' },
      { label: 'Glass verified' },
      { label: 'Finish verified' },
      { label: 'Doors operate correctly' },
      { label: 'Drawers operate correctly' },
      { label: 'Components labelled' },
      { label: 'Ready for installation', photo: true },
    ],
  },
  {
    title: '9. Factory Project Supervisor Final Release',
    items: [
      { label: 'All departmental sign-offs completed' },
      { label: 'Drawing compliance verified' },
      { label: 'Snag items resolved' },
      { label: 'Project quantities verified' },
      { label: 'Installation readiness confirmed' },
      { label: 'Packing list verified', photo: true },
    ],
  },
  {
    title: '10. Attestation by Factory Manager and Chief Production Officer',
    items: [
      {
        label:
          'I affirm that the end product of this production process is without snags and issues',
        help: 'Factory Manager (FM) attestation',
      },
      {
        label:
          'I affirm that the end product of this production process is without snags and issues (CPO)',
        help: 'Chief Production Officer (CPO) attestation',
      },
      { label: 'Factory Manager name', type: 'text' },
      { label: 'Chief Production Officer name', type: 'text' },
    ],
  },
]

async function main() {
  console.log(APPLY ? 'APPLY — writing' : 'DRY RUN — no writes')

  const [existing] = await db
    .select({ id: checklistDefinitions.id })
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.slug, SLUG))
    .limit(1)

  const total = SECTIONS.reduce((n, s) => n + s.items.length, 0)
  console.log(`${SECTIONS.length} sections, ${total} items`)
  SECTIONS.forEach((s, i) => console.log(`  step ${i + 1}: ${s.title} (${s.items.length})`))

  if (!APPLY) {
    console.log(existing ? '\nWould REPLACE items on the existing definition.' : '\nWould CREATE the definition.')
    return
  }

  let definitionId = existing?.id
  if (!definitionId) {
    const [created] = await db
      .insert(checklistDefinitions)
      .values({ slug: SLUG, name: NAME, targetRole: 'factory_pm', isActive: true })
      .returning({ id: checklistDefinitions.id })
    definitionId = created.id
    console.log('created definition', definitionId)
  } else {
    await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.definitionId, definitionId))
    console.log('replaced items on', definitionId)
  }

  const rows = SECTIONS.flatMap((section, sectionIndex) =>
    section.items.map((item, itemIndex) => ({
      definitionId: definitionId!,
      step: sectionIndex + 1,
      sectionTitle: section.title,
      sortOrder: itemIndex,
      label: item.label,
      itemType: (item.type ?? 'radio') as 'radio' | 'text',
      responseOptions: (OPTIONAL_SECTIONS.has(sectionIndex) ? 'yes_no_na' : 'yes_no') as
        | 'yes_no'
        | 'yes_no_na',
      isPhotoAllowed: true,
      isPhotoRequired: Boolean(item.photo),
      helpText: item.help ?? null,
      isActive: true,
    })),
  )
  await db.insert(checklistTemplateItems).values(rows)
  console.log(`inserted ${rows.length} items`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
