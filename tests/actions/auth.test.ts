import { describe, it } from 'vitest'

describe('auth actions (NextAuth Credentials)', () => {
  it.todo('AUTH-01: signUpAction hashes password (bcrypt) and inserts a users row')
  it.todo('AUTH-02: signUpAction rejects role=super_admin (whitelist factory_pm|site_pm)')
  it.todo('AUTH-03: requestPasswordResetAction issues a hashed reset token + Resend email; new-password form updates hashedPassword')
  it.todo('AUTH-04: signin uses NextAuth signIn(credentials); signout uses signOut')
})
