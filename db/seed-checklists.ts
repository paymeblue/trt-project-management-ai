/**
 * Seed checklist definitions and template items.
 * Run via: npx tsx db/seed-checklists.ts
 *
 * Uses a standalone neon+drizzle client so this can run outside Next.js context.
 * Top-level await is NOT used; all logic is wrapped in async function main().
 */

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from './schema'

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
  // Attempt insert; onConflictDoNothing skips if slug already exists.
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
    // Already existed — fetch by slug
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
    console.log(`Skipped (exists): "${name}" (${defId})`)
  }

  // Insert all template items unconditionally.
  // Re-running the seed will duplicate items; truncate checklist_template_items
  // before re-running if idempotency is required.
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
  console.log('Seeding checklist definitions...')

  // 1. Delivery Project Checklist — factory_pm
  await seedDefinition(
    'delivery_project',
    'Delivery Project Checklist',
    'factory_pm',
    [
      {
        step: 1, sortOrder: 1,
        label: 'Has the production order been fully completed and quality-checked?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
        helpText: 'Confirm all items on the production order are finished and inspected.',
      },
      {
        step: 1, sortOrder: 2,
        label: 'Are all furniture pieces labelled with the correct project reference?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 3,
        label: 'Is the delivery vehicle loaded and sealed per the packing list?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: true, isPhotoRequired: true,
      },
      {
        step: 1, sortOrder: 4,
        label: 'Have all fragile items been wrapped and protected for transit?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 5,
        label: 'Additional notes on factory dispatch',
        itemType: 'text', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'Record any exceptions or special handling instructions.',
      },
    ],
  )

  // 2. Confirmation / Verification — site_pm
  await seedDefinition(
    'confirmation',
    'Confirmation / Verification',
    'site_pm',
    [
      {
        step: 1, sortOrder: 1,
        label: 'Has the delivery been received and the packing list verified?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 2,
        label: 'Are there any damaged items identified on arrival?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: true, isPhotoRequired: true,
        helpText: 'Photograph any damage immediately.',
      },
      {
        step: 1, sortOrder: 3,
        label: 'Does the delivered quantity match the project schedule?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 4,
        label: 'Has the client representative signed the delivery note?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 5,
        label: 'Confirmation notes',
        itemType: 'text', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'Enter any discrepancies noted during confirmation.',
      },
    ],
  )

  // 3. Delivery Site Readiness — site_pm
  await seedDefinition(
    'delivery_site_readiness',
    'Delivery Site Readiness',
    'site_pm',
    [
      {
        step: 1, sortOrder: 1,
        label: 'Has the floor been tiled and is it cured and clean?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: true,
        helpText: 'Floor must be fully cured before furniture is placed.',
      },
      {
        step: 1, sortOrder: 2,
        label: 'Are the walls screeded, painted, and dry?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 3,
        label: 'Are electrical sockets and lighting installed and functional?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 4,
        label: 'Is the site clear of construction materials and debris?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 5,
        label: 'Are access routes (lifts, corridors) free and wide enough for delivery?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 6,
        label: 'Site readiness remarks',
        itemType: 'text', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'Note any outstanding works that may delay installation.',
      },
    ],
  )

  // 4. Sorting Checklist — site_pm
  await seedDefinition(
    'sorting',
    'Sorting Checklist',
    'site_pm',
    [
      {
        step: 1, sortOrder: 1,
        label: 'Have all delivered items been sorted by room / zone?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 2,
        label: 'Do the item labels match the room layout drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: "Cross-reference labels against the architect's layout.",
      },
      {
        step: 1, sortOrder: 3,
        label: 'Are all components and hardware bags accounted for?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 4,
        label: 'Have any missing items been flagged to the factory PM?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 5,
        label: 'Sorting notes',
        itemType: 'text', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'List any items that could not be sorted or are unaccounted for.',
      },
    ],
  )

  // 5. Change Request Checklist — site_pm
  await seedDefinition(
    'change_request',
    'Change Request Checklist',
    'site_pm',
    [
      {
        step: 1, sortOrder: 1,
        label: 'Has the change request been documented in writing?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 2,
        label: 'Has the client approved the change request and associated cost?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 3,
        label: 'Does the installed unit match the updated architect drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: true,
        helpText: 'Compare the installed piece to the revised drawing.',
      },
      {
        step: 1, sortOrder: 4,
        label: 'Has the change been communicated to the factory for records?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 5,
        label: 'Change request description',
        itemType: 'text', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'Describe the change requested and any impact on timeline.',
      },
    ],
  )

  // 6. Close Out Process — site_pm
  await seedDefinition(
    'close_out',
    'Close Out Process',
    'site_pm',
    [
      {
        step: 1, sortOrder: 1,
        label: 'Has all furniture been fully installed per the layout drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: true,
      },
      {
        step: 1, sortOrder: 2,
        label: 'Have all protective wrappings and packaging been removed and disposed of?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 3,
        label: 'Does the installed unit match the architect drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
        helpText: 'Final check against the approved design drawing.',
      },
      {
        step: 1, sortOrder: 4,
        label: 'Has the client signed off on the completed installation?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 5,
        label: 'Are there any snagging items outstanding?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 6,
        label: 'Close-out notes and snagging details',
        itemType: 'text', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'List any outstanding snagging items and their expected resolution date.',
      },
    ],
  )

  // 7. Installation Process — site_pm (quick task 260714-qe4: replaces the
  // former 'sorting' + 'close_out' checklists with ONE on-site checklist
  // covering sorting, execution, and close-out sections).
  await seedDefinition(
    'installation_process',
    'Installation Process',
    'site_pm',
    [
      {
        step: 1, sortOrder: 1,
        label: 'Have all delivered items been sorted by room / zone?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 2,
        label: 'Do the item labels match the room layout drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: "Cross-reference labels against the architect's layout.",
      },
      {
        step: 1, sortOrder: 3,
        label: 'Are all components and hardware bags accounted for?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 1, sortOrder: 4,
        label: 'Have any missing items been flagged to the factory PM?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 2, sortOrder: 1,
        label: 'Has installation started per the layout drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
        helpText: 'Execution section — covers the on-site installation work itself.',
      },
      {
        step: 2, sortOrder: 2,
        label: 'Has all furniture been fully installed per the layout drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: true,
      },
      {
        step: 2, sortOrder: 3,
        label: 'Does the installed unit match the architect drawing?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
        helpText: 'Check against the approved design drawing during execution.',
      },
      {
        step: 3, sortOrder: 1,
        label: 'Have all protective wrappings and packaging been removed and disposed of?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'Close-out section.',
      },
      {
        step: 3, sortOrder: 2,
        label: 'Has the client signed off on the completed installation?',
        itemType: 'radio', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
      },
      {
        step: 3, sortOrder: 3,
        label: 'Are there any snagging items outstanding?',
        itemType: 'radio', responseOptions: 'yes_no_na',
        isPhotoAllowed: true, isPhotoRequired: false,
      },
      {
        step: 3, sortOrder: 4,
        label: 'Close-out notes and snagging details',
        itemType: 'text', responseOptions: 'yes_no',
        isPhotoAllowed: false, isPhotoRequired: false,
        helpText: 'List any outstanding snagging items and their expected resolution date.',
      },
    ],
  )

  console.log('Seed complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
