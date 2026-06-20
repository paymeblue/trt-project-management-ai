import { verifyEmailAction } from '@/actions/email-auth'

interface Props {
  searchParams: Promise<{ token?: string }>
}

/**
 * Email verification page.
 * Consumes the one-time token from the query string and marks the account verified.
 * Next 16: searchParams is a Promise — must be awaited.
 */
export default async function VerifyEmailPage({ searchParams }: Props) {
  const sp = await searchParams
  const token = sp.token

  if (!token) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold text-red-600">Missing token</h1>
        <p className="text-sm text-gray-600">
          The verification link appears to be incomplete. Please use the link from your
          email, or request a new verification email.
        </p>
      </div>
    )
  }

  const result = await verifyEmailAction(token)

  if (result.ok) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold text-green-600">Email verified</h1>
        <p className="text-sm text-gray-600">
          Your email address has been confirmed. You can now{' '}
          <a href="/login" className="text-blue-600 underline">
            sign in
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-red-600">
        Invalid or expired link
      </h1>
      <p className="text-sm text-gray-600">
        This verification link has already been used or has expired. Please request a
        new verification email from your account settings.
      </p>
    </div>
  )
}
