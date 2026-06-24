/**
 * Seed the three workflow-only checklist definitions that have no screen of
 * their own: Project Check Report, Approval to Commence Installation, and
 * Installation Readiness.
 *
 * Run via: npm run db:seed-workflow-checklists
 *
 * Idempotent: re-inserts template items fresh on every run (clears the
 * definition's existing items first).
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from './schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { checklistDefinitions, checklistTemplateItems } = schema

type TemplateItemInput = {
  step: number
  sortOrder: number
  label: string
  itemType: 'radio' | 'text' | 'file'
  responseOptions: 'yes_no' | 'yes_no_na'
  isPhotoAllowed: boolean
  isPhotoRequired: boolean
  helpText?: string
}

async function seedDefinition(
  slug: string,
  name: string,
  targetRole: 'factory_pm' | 'site_pm' | 'both',
  items: TemplateItemInput[],
) {
  const inserted = await db
    .insert(checklistDefinitions)
    .values({ slug, name, targetRole, isActive: true })
    .onConflictDoNothing()
    .returning({ id: checklistDefinitions.id })

  let defId: string
  if (inserted.length > 0) {
    defId = inserted[0].id
    console.log(`Inserted definition: "${name}" (${defId})`)
  } else {
    const [found] = await db
      .select({ id: checklistDefinitions.id })
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.slug, slug))
      .limit(1)
    if (!found) {
      console.error(`ERROR: Could not resolve id for slug="${slug}"`)
      return
    }
    defId = found.id
    // Clear existing items so re-running stays idempotent.
    await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.definitionId, defId))
    console.log(`Refreshed definition: "${name}" (${defId})`)
  }

  for (const item of items) {
    await db.insert(checklistTemplateItems).values({
      definitionId: defId,
      step: item.step,
      sortOrder: item.sortOrder,
      label: item.label,
      itemType: item.itemType,
      responseOptions: item.responseOptions,
      isPhotoAllowed: item.isPhotoAllowed,
      isPhotoRequired: item.isPhotoRequired,
      helpText: item.helpText ?? null,
      isActive: true,
    })
  }
  console.log(`  + ${items.length} template items for "${name}"`)
}

async function main() {
  console.log('Seeding workflow checklist definitions...')

  // Step 7 — Project Check Report (Factory PM)
  await seedDefinition('project_check_report', 'Project Check Report', 'factory_pm', [
    { step: 1, sortOrder: 1, label: 'Have all delivered items been checked against the packing list?', itemType: 'radio', responseOptions: 'yes_no_na', isPhotoAllowed: true, isPhotoRequired: false },
    { step: 1, sortOrder: 2, label: 'Were any items found damaged or missing on arrival?', itemType: 'radio', responseOptions: 'yes_no', isPhotoAllowed: true, isPhotoRequired: false, helpText: 'Photograph any damage or shortfalls.' },
    { step: 1, sortOrder: 3, label: 'Do the delivered units match the approved specification?', itemType: 'radio', responseOptions: 'yes_no_na', isPhotoAllowed: true, isPhotoRequired: false },
    { step: 1, sortOrder: 4, label: 'Summary of the project check', itemType: 'text', responseOptions: 'yes_no', isPhotoAllowed: false, isPhotoRequired: false, helpText: 'Record findings and any follow-up actions.' },
  ])

  // Step 8 — Approval to Commence Installation (Operations)
  await seedDefinition('approval_to_commence_installation', 'Approval to Commence Installation', 'both', [
    { step: 1, sortOrder: 1, label: 'Has the Project Check Report been reviewed and accepted?', itemType: 'radio', responseOptions: 'yes_no', isPhotoAllowed: false, isPhotoRequired: false },
    { step: 1, sortOrder: 2, label: 'Are all outstanding issues resolved or accepted?', itemType: 'radio', responseOptions: 'yes_no_na', isPhotoAllowed: false, isPhotoRequired: false },
    { step: 1, sortOrder: 3, label: 'Is the site confirmed ready for installation to begin?', itemType: 'radio', responseOptions: 'yes_no', isPhotoAllowed: false, isPhotoRequired: false },
    { step: 1, sortOrder: 4, label: 'Approval notes', itemType: 'text', responseOptions: 'yes_no', isPhotoAllowed: false, isPhotoRequired: false, helpText: 'Record the basis for approval.' },
  ])

  // Step 9 — Installation Readiness (Site PM)
  await seedDefinition('installation_readiness', 'Installation Readiness', 'site_pm', [
    { step: 1, sortOrder: 1, label: 'Is the installation area clear and accessible?', itemType: 'radio', responseOptions: 'yes_no', isPhotoAllowed: true, isPhotoRequired: false },
    { step: 1, sortOrder: 2, label: 'Are services (power, water, etc.) available as required?', itemType: 'radio', responseOptions: 'yes_no_na', isPhotoAllowed: true, isPhotoRequired: false },
    { step: 1, sortOrder: 3, label: 'Are all tools and the installation team on site?', itemType: 'radio', responseOptions: 'yes_no', isPhotoAllowed: false, isPhotoRequired: false },
    { step: 1, sortOrder: 4, label: 'Installation readiness notes', itemType: 'text', responseOptions: 'yes_no', isPhotoAllowed: false, isPhotoRequired: false },
  ])

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
