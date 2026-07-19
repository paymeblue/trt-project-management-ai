import { describe, it, expect } from 'vitest'
import { stepTurnEmail, projectClosedOutEmail } from '@/lib/email-templates'

describe('stepTurnEmail (position-scoped step notification, 2026-07-19)', () => {
  it('includes project name and the pending step label', () => {
    const { subject, html, text } = stepTurnEmail({
      projectName: 'Acme Villa',
      stepLabel: 'Send for Production',
    })
    expect(subject).toContain('Send for Production')
    expect(subject).toContain('Acme Villa')
    expect(subject).toMatch(/your turn/i)
    expect(html).toContain('Send for Production')
    expect(html).toContain('Acme Villa')
    expect(text).toContain('Send for Production')
  })
})

describe('projectClosedOutEmail (item #11)', () => {
  it('reports on-time delivery when metDeadline is true', () => {
    const { html } = projectClosedOutEmail({ projectName: 'Acme Villa', metDeadline: true })
    expect(html).toMatch(/within its final step deadline/i)
    expect(html).not.toMatch(/PAST/)
  })

  it('reports late delivery when metDeadline is false', () => {
    const { html } = projectClosedOutEmail({ projectName: 'Acme Villa', metDeadline: false })
    expect(html).toMatch(/PAST/)
  })

  it('reports indeterminate status when metDeadline is null (no deadline set)', () => {
    const { html } = projectClosedOutEmail({ projectName: 'Acme Villa', metDeadline: null })
    expect(html).toMatch(/could not be determined/i)
  })
})
