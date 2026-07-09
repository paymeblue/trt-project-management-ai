/**
 * One-time demo setup (v2.0 Phase 21 demo): creates real, loginable accounts
 * for walking through the new Design pipeline live — a Head Designer (the
 * only one who can act on the two assignment steps, per requiredPosition),
 * a Designer, and an Architect (both in the assignment pool). Idempotent —
 * re-running updates the password/position of existing accounts with the
 * same email rather than erroring.
 *
 * Run via: npx tsx scripts/seed-demo-design-users.ts
 *
 * Prints the plaintext temp passwords to the console ONLY — never written
 * to any file, never committed. Change them after the demo via the admin
 * password-reset flow if these accounts are kept around.
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import * as schema from '../db/schema'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const DEMO_PASSWORD = 'DemoDesign2026!'

const DEMO_USERS = [
  { email: 'head.designer@trtarredo.demo', name: 'Amaka Okoye (Head Designer)', role: 'design' as const, position: 'head_designer' },
  { email: 'designer@trtarredo.demo', name: 'Tunde Bello (Designer)', role: 'design' as const, position: null },
  { email: 'architect@trtarredo.demo', name: 'Ifeoma Nwosu (Architect)', role: 'architect' as const, position: null },
]

async function main() {
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 10)
  for (const u of DEMO_USERS) {
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, u.email)).limit(1)
    if (existing) {
      await db
        .update(schema.users)
        .set({ name: u.name, role: u.role, position: u.position, hashedPassword: hashed, updatedAt: new Date() })
        .where(eq(schema.users.id, existing.id))
      console.log(`  updated: ${u.email} (${u.role}${u.position ? `, position=${u.position}` : ''})`)
    } else {
      await db.insert(schema.users).values({
        email: u.email,
        name: u.name,
        role: u.role,
        position: u.position,
        hashedPassword: hashed,
        emailVerified: new Date(),
      })
      console.log(`  created: ${u.email} (${u.role}${u.position ? `, position=${u.position}` : ''})`)
    }
  }
  console.log(`\nDemo login password for all 3 accounts: ${DEMO_PASSWORD}`)
  console.log('Demo accounts:')
  for (const u of DEMO_USERS) console.log(`  ${u.email}`)
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
