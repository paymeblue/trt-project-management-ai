import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  verificationEmail,
  credentialsEmail,
  passwordResetEmail,
  stepTurnEmail,
  projectClosedOutEmail,
  escalationAmendedEmail,
  videoCallScheduledEmail,
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
  it('stepTurnEmail CTA points at the role-aware /dashboard', () => {
    vi.stubEnv('APP_URL', 'https://trt.example.com')
    const { html } = stepTurnEmail({ projectName: 'Acme Villa', stepLabel: 'Send for Production' })
    expect(html).toMatch(/<a[^>]+href="https:\/\/trt\.example\.com\/dashboard"/)
  })

  it('projectClosedOutEmail CTA points at the role-aware /dashboard', () => {
    vi.stubEnv('APP_URL', 'https://trt.example.com')
    const { html } = projectClosedOutEmail({ projectName: 'Acme Villa', metDeadline: true })
    expect(html).toMatch(/<a[^>]+href="https:\/\/trt\.example\.com\/dashboard"/)
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

describe('escalationAmendedEmail', () => {
  const base = {
    projectName: 'Acme Villa',
    checklistLabel: 'Factory Process Checklist',
    disputeUrl: 'https://trt.example.com/disputes/proj-1',
  }

  it('subject contains the checklist label and project name and reads as an update', () => {
    const { subject } = escalationAmendedEmail({ ...base, stepN: 3, amenderName: 'Jane' })
    expect(subject).toContain('Factory Process Checklist')
    expect(subject).toContain('Acme Villa')
    expect(subject.toLowerCase()).toMatch(/updated/)
  })

  it('html contains project name, checklist label, and Step {n} when stepN is non-null', () => {
    const { html } = escalationAmendedEmail({ ...base, stepN: 3, amenderName: 'Jane' })
    expect(html).toContain('Acme Villa')
    expect(html).toContain('Factory Process Checklist')
    expect(html).toContain('Step 3')
    expect(html).toContain('Jane')
  })

  it('omits the step line entirely when stepN is null', () => {
    const { html } = escalationAmendedEmail({ ...base, stepN: null, amenderName: 'Jane' })
    expect(html).not.toMatch(/Step \d/)
  })

  it('falls back to "a supervisor" when amenderName is null', () => {
    const { html } = escalationAmendedEmail({ ...base, stepN: null, amenderName: null })
    expect(html).toContain('a supervisor')
  })

  it('CTA label mentions the escalation/dispute and href is the passed disputeUrl', () => {
    const { html } = escalationAmendedEmail({ ...base, stepN: null, amenderName: 'Jane' })
    expect(html).toMatch(/<a[^>]+href="https:\/\/trt\.example\.com\/disputes\/proj-1"[^>]*>[^<]*(escalation|dispute)/i)
  })

  it('text contains the project name and the raw url', () => {
    const { text } = escalationAmendedEmail({ ...base, stepN: null, amenderName: 'Jane' })
    expect(text).toContain('Acme Villa')
    expect(text).toContain('https://trt.example.com/disputes/proj-1')
  })

  it('escapes a project name containing a script tag — no raw <script survives', () => {
    const { html } = escalationAmendedEmail({
      ...base,
      projectName: 'Villa & Sons <script>alert(1)</script>',
      stepN: null,
      amenderName: 'Jane',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&amp;')
  })
})

describe('videoCallScheduledEmail', () => {
  const base = {
    scheduledFor: new Date('2026-08-01T14:30:00Z'),
    schedulerName: 'Admin User',
    participantNames: ['Alice', 'Bob'],
    joinUrl: 'https://trt.example.com/calls/call-1',
  }

  it('subject names the call and reads as a scheduled invitation', () => {
    const { subject } = videoCallScheduledEmail({ ...base, title: 'Site Kickoff' })
    expect(subject).toContain('Site Kickoff')
    expect(subject.toLowerCase()).toMatch(/invited/)
  })

  it('html contains the formatted date/time and an explicit UTC label', () => {
    const { html } = videoCallScheduledEmail({ ...base, title: 'Site Kickoff' })
    expect(html).toContain('2026')
    expect(html).toContain('UTC')
  })

  it('lists every participant name, escaped', () => {
    const { html } = videoCallScheduledEmail({
      ...base,
      title: 'Site Kickoff',
      participantNames: ['Alice & Bob', 'Carol'],
    })
    expect(html).toContain('Alice &amp; Bob')
    expect(html).toContain('Carol')
  })

  it('falls back to "Video call" when title is null', () => {
    const { subject, html } = videoCallScheduledEmail({ ...base, title: null })
    expect(subject).toContain('Video call')
    expect(html).toContain('Video call')
  })

  it('falls back to "Video call" when title is blank', () => {
    const { subject } = videoCallScheduledEmail({ ...base, title: '   ' })
    expect(subject).toContain('Video call')
  })

  it('CTA label is a join label and href equals joinUrl', () => {
    const { html } = videoCallScheduledEmail({ ...base, title: 'Site Kickoff' })
    expect(html).toMatch(/<a[^>]+href="https:\/\/trt\.example\.com\/calls\/call-1"[^>]*>[^<]*join/i)
  })

  it('text contains the time string and the raw url', () => {
    const { text } = videoCallScheduledEmail({ ...base, title: 'Site Kickoff' })
    expect(text).toContain('2026')
    expect(text).toContain('https://trt.example.com/calls/call-1')
  })
})
