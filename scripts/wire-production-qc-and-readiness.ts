/**
 * Two content changes for TRT Arredo's paper forms (2026-07-31):
 *
 *  1. Points live workflow step 15 (production_process) at the new fuller
 *     10-section `production_quality_control` checklist.
 *  2. Rewrites the `factory_manager_readiness` checklist to match the paper
 *     MATERIALS/ACCESSORIES READINESS FORM verbatim.
 *
 *   npx tsx scripts/wire-production-qc-and-readiness.ts            # dry run
 *   npx tsx scripts/wire-production-qc-and-readiness.ts --apply
 *
 * Idempotent — re-running replaces the readiness items and re-asserts the slug.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const db = drizzle(neon(process.env.DATABASE_URL!), { schema })
const { checklistDefinitions, checklistTemplateItems, workflowStepDefinitions } = schema

const APPLY = process.argv.includes('--apply')
const NEW_PRODUCTION_SLUG = 'production_quality_control'
const READINESS_SLUG = 'factory_manager_readiness'

// Transcribed from the paper form. The signature and date lines are omitted
// deliberately: the app already records WHO submitted and WHEN, so re-asking
// for them as free text would invite a second, unverified answer that could
// contradict the audit trail.
const READINESS_ITEMS: { label: string; type: 'radio' | 'text'; help?: string }[] = [
  { label: 'Project', type: 'text' },
  { label: 'Unit', type: 'text' },
  { label: 'Materials/Quality control', type: 'radio' },
  { label: 'Accessories', type: 'radio' },
  { label: 'Upholstery', type: 'radio' },
  {
    label:
      'I confirm that the above-listed materials and accessories are complete for review and check',
    type: 'radio',
    help: 'Confirmation statement',
  },
]

async function main() {
  console.log(APPLY ? 'APPLY — writing' : 'DRY RUN — no writes')

  // ---- 1. repoint step 15 -------------------------------------------------
  const [step] = await db
    .select({ id: workflowStepDefinitions.id, slug: workflowStepDefinitions.checklistSlug })
    .from(workflowStepDefinitions)
    .where(
      and(
        eq(workflowStepDefinitions.graph, 'live'),
        eq(workflowStepDefinitions.stepKey, 'production_process'),
      ),
    )
    .limit(1)

  if (!step) {
    console.log('SKIP: live step production_process not found')
  } else {
    console.log(`step 15 checklist: ${step.slug} -> ${NEW_PRODUCTION_SLUG}`)
    const [target] = await db
      .select({ id: checklistDefinitions.id })
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.slug, NEW_PRODUCTION_SLUG))
      .limit(1)
    if (!target) throw new Error(`${NEW_PRODUCTION_SLUG} definition missing — seed it first`)
    if (APPLY) {
      await db
        .update(workflowStepDefinitions)
        .set({ checklistSlug: NEW_PRODUCTION_SLUG })
        .where(eq(workflowStepDefinitions.id, step.id))
    }
  }

  // ---- 2. rewrite the readiness form --------------------------------------
  const [readiness] = await db
    .select({ id: checklistDefinitions.id, name: checklistDefinitions.name })
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.slug, READINESS_SLUG))
    .limit(1)

  if (!readiness) {
    console.log(`SKIP: ${READINESS_SLUG} definition not found`)
  } else {
    console.log(`\n${READINESS_SLUG}: "${readiness.name}" -> "Materials/Accessories Readiness Form"`)
    READINESS_ITEMS.forEach((i, n) => console.log(`  ${n + 1}. [${i.type}] ${i.label}`))
    if (APPLY) {
      await db
        .update(checklistDefinitions)
        .set({ name: 'Materials/Accessories Readiness Form' })
        .where(eq(checklistDefinitions.id, readiness.id))
      // SOFT delete: checklist_responses FK-reference template items, so a hard
      // DELETE fails the moment the form has ever been submitted (hit live on
      // 2026-07-31). Deactivating keeps historical submissions readable while
      // removing the old items from the form — the checklist page already
      // filters on is_active.
      await db
        .update(checklistTemplateItems)
        .set({ isActive: false })
        .where(eq(checklistTemplateItems.definitionId, readiness.id))
      await db.insert(checklistTemplateItems).values(
        READINESS_ITEMS.map((item, index) => ({
          definitionId: readiness.id,
          step: 1,
          sectionTitle: 'Materials/Accessories Readiness',
          sortOrder: index,
          label: item.label,
          itemType: item.type,
          responseOptions: 'yes_no' as const,
          isPhotoAllowed: true,
          isPhotoRequired: false,
          helpText: item.help ?? null,
          isActive: true,
        })),
      )
      console.log(`  inserted ${READINESS_ITEMS.length} items`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
