/**
 * Seed sample Processes (incl. a Mermaid flow chart) and static content.
 * Run: DATABASE_URL=... npx tsx db/seed-processes.ts
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })
const { users, processes, staticContent } = schema

async function main() {
  const [u] = await db.select().from(users).limit(1)
  if (!u) {
    console.error('No users found — sign up or seed an admin first.')
    process.exit(1)
  }

  await db
    .insert(processes)
    .values([
      {
        title: 'Order to Delivery Flow',
        slug: 'order-to-delivery',
        body:
          'How an order moves from intake to installation.\n\n```mermaid\ngraph TD\n  A[Order received] --> B[Production]\n  B --> C[QA check]\n  C --> D[Dispatch to site]\n  D --> E[Site installation]\n  E --> F[Close out]\n```\n\nEach stage has an owner and an approval gate.',
        createdBy: u.id,
      },
      {
        title: 'Site Verification Process',
        slug: 'site-verification',
        body:
          'Before a factory item is dispatched, the Site PM verifies the site matches the architect drawing: floor tiled, walls screeded and painted, measurements confirmed.',
        createdBy: u.id,
      },
    ])
    .onConflictDoNothing()

  await db
    .insert(staticContent)
    .values([
      {
        slug: 'about_trt',
        title: 'About TRT',
        body:
          'TRT Arredo designs, manufactures and installs bespoke furniture.\n\nManagement team, company policies and website links live here. (Edit as Super Admin.)',
        updatedBy: u.id,
      },
      {
        slug: 'email_formats',
        title: 'Email Formats',
        body:
          'Standard email templates:\n\n— Delivery confirmation\n— Site readiness request\n— Change request acknowledgement',
        updatedBy: u.id,
      },
    ])
    .onConflictDoNothing()

  console.log('SUCCESS: processes and static content seeded')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
