import { describe, it, expect } from 'vitest'
import { taskCompletedEmail, projectClosedOutEmail } from '@/lib/email-templates'

describe('taskCompletedEmail (item #11)', () => {
  it('includes project name, step label, and actor name', () => {
    const { subject, html, text } = taskCompletedEmail({
      projectName: 'Acme Villa',
      stepLabel: 'Send for Production',
      actorName: 'Jane Doe',
    })
    expect(subject).toContain('Send for Production')
    expect(subject).toContain('Acme Villa')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('Send for Production')
    expect(html).toContain('Acme Villa')
    expect(text).toContain('Jane Doe')
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
