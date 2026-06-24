/**
 * CLI-only Operations user provisioning script.
 * Run via: npm run db:seed-operations
 *
 * Operations is a separate user model with full super-admin rights (admin area,
 * project creation, timeline). The displayed role label uses their `position`
 * (e.g. "Head of Projects").
 *
 * Requires: DATABASE_URL, OPERATIONS_EMAIL, OPERATIONS_PASSWORD
 * Optional:  OPERATIONS_NAME (default 'Operations'), OPERATIONS_POSITION (default 'Head of Projects')
 */

import { config } from 'dotenv'
import bcrypt from 'bcryptjs'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { users } = schema

const email = process.env.OPERATIONS_EMAIL
const password = process.env.OPERATIONS_PASSWORD
const name = process.env.OPERATIONS_NAME ?? 'Operations'
const position = process.env.OPERATIONS_POSITION ?? 'Head of Projects'

async function main() {
  if (!email || !password) {
    console.error('ERROR: OPERATIONS_EMAIL and OPERATIONS_PASSWORD must be set in the environment.')
    process.exit(1)
  }

  const hashed = await bcrypt.hash(password, 10)

  await db
    .insert(users)
    .values({
      email: email.toLowerCase().trim(),
      name,
      position,
      role: 'operations',
      hashedPassword: hashed,
      emailVerified: new Date(),
    })
    .onConflictDoNothing()

  console.log(`SUCCESS: operations user provisioned for ${email} (${position})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
