import NewPasswordForm from './new-password-form'
import RequestResetForm from './request-reset-form'

interface Props {
  searchParams: Promise<{ token?: string }>
}

/**
 * Password reset page — dual branch:
 *   ?token=<raw>  → complete-reset mode: renders NewPasswordForm (client)
 *   (no token)    → request mode: renders RequestResetForm (client, non-enumerating)
 *
 * Next 16: searchParams is a Promise — must be awaited.
 */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const sp = await searchParams
  const token = sp.token

  if (token) {
    return <NewPasswordForm token={token} />
  }

  return <RequestResetForm />
}
