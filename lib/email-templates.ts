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

export function credentialsEmail({
  name,
  email,
  password,
  roleLabel,
  loginUrl,
}: {
  name: string
  email: string
  password: string
  roleLabel: string
  loginUrl: string
}) {
  const subject = 'Your TRT PM account'
  const html = `
<p>Hi ${name},</p>
<p>An account has been created for you on TRT PM as <strong>${roleLabel}</strong>. Use these credentials to sign in:</p>
<p><strong>Email:</strong> ${email}<br/><strong>Temporary password:</strong> ${password}</p>
<p><a href="${loginUrl}">Sign in to TRT PM</a></p>
<p>For your security, please change your password after your first sign-in.</p>
`.trim()
  const text = `Hi ${name},\n\nAn account has been created for you on TRT PM as ${roleLabel}.\n\nEmail: ${email}\nTemporary password: ${password}\n\nSign in: ${loginUrl}\n\nPlease change your password after your first sign-in.`

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
