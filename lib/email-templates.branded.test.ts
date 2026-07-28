import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  verificationEmail,
  credentialsEmail,
  passwordResetEmail,
  stepTurnEmail,
  projectClosedOutEmail,
} from '@/lib/email-templates'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('all 5 existing templates render through the branded layout', () => {
  it('verificationEmail', () => {
    const { html } = verificationEmail({ name: 'Alice', verifyUrl: 'https://example.com/verify?token=abc123' })
    expect(html).toContain('<!DOCTYPE')
    expect(html).toContain('TRT ARREDO')
    expect(html).toContain('max-width:600px')
  })

  it('credentialsEmail', () => {
    const { html } = credentialsEmail({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'temp123',
      roleLabel: 'Factory PM',
      loginUrl: 'https://example.com/sign-in',
    })
    expect(html).toContain('<!DOCTYPE')
    expect(html).toContain('TRT ARREDO')
    expect(html).toContain('max-width:600px')
  })

  it('passwordResetEmail', () => {
    const { html } = passwordResetEmail({ name: 'Carol', resetUrl: 'https://example.com/reset?token=xyz789' })
    expect(html).toContain('<!DOCTYPE')
    expect(html).toContain('TRT ARREDO')
    expect(html).toContain('max-width:600px')
  })

  it('stepTurnEmail', () => {
    const { html } = stepTurnEmail({ projectName: 'Acme Villa', stepLabel: 'Send for Production' })
    expect(html).toContain('<!DOCTYPE')
    expect(html).toContain('TRT ARREDO')
    expect(html).toContain('max-width:600px')
  })

  it('projectClosedOutEmail', () => {
    const { html } = projectClosedOutEmail({ projectName: 'Acme Villa', metDeadline: true })
    expect(html).toContain('<!DOCTYPE')
    expect(html).toContain('TRT ARREDO')
    expect(html).toContain('max-width:600px')
  })
})

describe('CTA hrefs match the passed URLs for the 3 auth templates', () => {
  it('verificationEmail CTA href is the verifyUrl', () => {
    const { html } = verificationEmail({ name: 'Alice', verifyUrl: 'https://example.com/verify?token=abc123' })
    expect(html).toMatch(/<a[^>]+href="https:\/\/example\.com\/verify\?token=abc123"/)
  })

  it('credentialsEmail CTA href is the loginUrl', () => {
    const { html } = credentialsEmail({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'temp123',
      roleLabel: 'Factory PM',
      loginUrl: 'https://example.com/sign-in',
    })
    expect(html).toMatch(/<a[^>]+href="https:\/\/example\.com\/sign-in"/)
  })

  it('passwordResetEmail CTA href is the resetUrl', () => {
    const { html } = passwordResetEmail({ name: 'Carol', resetUrl: 'https://example.com/reset?token=xyz789' })
    expect(html).toMatch(/<a[^>]+href="https:\/\/example\.com\/reset\?token=xyz789"/)
  })
})

describe('stepTurnEmail and projectClosedOutEmail emit an APP_URL-derived CTA', () => {
  it('stepTurnEmail CTA points at absoluteUrl("/")', () => {
    vi.stubEnv('APP_URL', 'https://trt.example.com')
    const { html } = stepTurnEmail({ projectName: 'Acme Villa', stepLabel: 'Send for Production' })
    expect(html).toMatch(/<a[^>]+href="https:\/\/trt\.example\.com\/"/)
  })

  it('projectClosedOutEmail CTA points at absoluteUrl("/")', () => {
    vi.stubEnv('APP_URL', 'https://trt.example.com')
    const { html } = projectClosedOutEmail({ projectName: 'Acme Villa', metDeadline: true })
    expect(html).toMatch(/<a[^>]+href="https:\/\/trt\.example\.com\/"/)
  })
})

describe('escaping is wired into the templates, not just available', () => {
  it('stepTurnEmail escapes an XSS-bearing projectName/stepLabel', () => {
    const { html } = stepTurnEmail({
      projectName: '<img src=x onerror=1>',
      stepLabel: 'A & B',
    })
    expect(html).not.toContain('<img src=x onerror=1>')
    expect(html).toContain('&amp;')
  })
})

describe('plaintext fallback is non-empty and contains key facts', () => {
  it('verificationEmail text contains the verifyUrl', () => {
    const { text } = verificationEmail({ name: 'Alice', verifyUrl: 'https://example.com/verify?token=abc123' })
    expect(text.length).toBeGreaterThan(0)
    expect(text).toContain('https://example.com/verify?token=abc123')
  })

  it('credentialsEmail text contains the temp password and login url', () => {
    const { text } = credentialsEmail({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'temp123',
      roleLabel: 'Factory PM',
      loginUrl: 'https://example.com/sign-in',
    })
    expect(text).toContain('temp123')
    expect(text).toContain('https://example.com/sign-in')
  })

  it('passwordResetEmail text contains the resetUrl', () => {
    const { text } = passwordResetEmail({ name: 'Carol', resetUrl: 'https://example.com/reset?token=xyz789' })
    expect(text).toContain('https://example.com/reset?token=xyz789')
  })

  it('stepTurnEmail text contains the step label and project name', () => {
    const { text } = stepTurnEmail({ projectName: 'Acme Villa', stepLabel: 'Send for Production' })
    expect(text).toContain('Send for Production')
    expect(text).toContain('Acme Villa')
  })

  it('projectClosedOutEmail text contains the project name', () => {
    const { text } = projectClosedOutEmail({ projectName: 'Acme Villa', metDeadline: false })
    expect(text).toContain('Acme Villa')
  })
})

describe('subjects are unchanged from before the refactor', () => {
  it('verificationEmail subject', () => {
    expect(verificationEmail({ name: 'A', verifyUrl: 'https://e.com/v' }).subject).toBe(
      'Verify your TRT PM account',
    )
  })

  it('credentialsEmail subject', () => {
    expect(
      credentialsEmail({ name: 'A', email: 'a@e.com', password: 'p', roleLabel: 'R', loginUrl: 'https://e.com/l' })
        .subject,
    ).toBe('Your TRT PM account')
  })

  it('passwordResetEmail subject', () => {
    expect(passwordResetEmail({ name: 'A', resetUrl: 'https://e.com/r' }).subject).toBe(
      'Reset your TRT PM password',
    )
  })

  it('stepTurnEmail subject', () => {
    expect(stepTurnEmail({ projectName: 'P', stepLabel: 'S' }).subject).toBe('Your turn: S — P')
  })

  it('projectClosedOutEmail subject', () => {
    expect(projectClosedOutEmail({ projectName: 'P', metDeadline: true }).subject).toBe(
      'Project closed out: P',
    )
  })
})
