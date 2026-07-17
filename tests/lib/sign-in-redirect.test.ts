import { describe, it, expect } from 'vitest'
import { shouldRedirectFromSignIn } from '@/lib/auth/sign-in-redirect'

describe('shouldRedirectFromSignIn (D-01/D-03 redirect-vs-render decision)', () => {
  it('(no session, no newSession) -> false: nothing to redirect from, show the form', () => {
    expect(shouldRedirectFromSignIn(false, false)).toBe(false)
  })

  it('(session, no newSession) -> true: D-01 default convenience, redirect to /dashboard', () => {
    expect(shouldRedirectFromSignIn(true, false)).toBe(true)
  })

  it('(no session, newSession) -> false: no session to conflict with anyway, show the form', () => {
    expect(shouldRedirectFromSignIn(false, true)).toBe(false)
  })

  it('(session, newSession) -> false: D-03 carve-out, reach the credentials form despite an existing session', () => {
    expect(shouldRedirectFromSignIn(true, true)).toBe(false)
  })
})
