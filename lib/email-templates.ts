export function verificationEmail({ name, verifyUrl }: { name: string; verifyUrl: string }) {
  const subject = 'Verify your TRT PM account'
  const html = `
<p>Hi ${name},</p>
<p>Welcome to TRT PM. Please confirm your email address to activate your account:</p>
<p><a href="${verifyUrl}">Verify email</a></p>
<p>If you did not create an account, you can safely ignore this email.</p>
`.trim()
  const text = `Hi ${name},\n\nWelcome to TRT PM. Verify your email here: ${verifyUrl}\n\nIf you did not create an account, ignore this email.`

  return { subject, html, text }
}

export function passwordResetEmail({ name, resetUrl }: { name: string; resetUrl: string }) {
  const subject = 'Reset your TRT PM password'
  const html = `
<p>Hi ${name},</p>
<p>We received a request to reset your TRT PM password:</p>
<p><a href="${resetUrl}">Reset password</a></p>
<p>This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
`.trim()
  const text = `Hi ${name},\n\nReset your TRT PM password here: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`

  return { subject, html, text }
}
