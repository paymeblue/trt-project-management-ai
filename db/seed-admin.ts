/**
 * CLI-only super_admin provisioning script.
 * Run via: npm run db:seed-admin
 *
 * This is the ONLY place 'super_admin' is written into the users table.
 * It is never a Server Action, never a route, and never reachable over HTTP.
 *
 * Requires environment variables: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 * Optionally: ADMIN_NAME (defaults to 'Super Admin')
 */

import bcrypt from 'bcryptjs'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Build a standalone db client (avoids the server-only guard on @/db)
const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { users } = schema

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
const name = process.env.ADMIN_NAME ?? 'Super Admin'

async function main() {
  if (!email || !password) {
    console.error('ERROR: ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment.')
    process.exit(1)
  }

  const hashed = await bcrypt.hash(password, 10)

  await db
    .insert(users)
    .values({
      email: email.toLowerCase().trim(),
      name,
      role: 'super_admin',
      hashedPassword: hashed,
      emailVerified: new Date(),
    })
    .onConflictDoNothing()

  console.log(`SUCCESS: super_admin user provisioned for ${email}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
