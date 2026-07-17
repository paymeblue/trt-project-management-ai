import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { shouldRedirectFromSignIn } from '@/lib/auth/sign-in-redirect'
import SignInForm from './sign-in-form'
import NewSessionForm from './new-session-form'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ newSession?: string }>
}) {
  const { newSession } = await searchParams
  const session = await auth()
  if (shouldRedirectFromSignIn(!!session?.user, !!newSession)) {
    redirect('/dashboard')
  }
  return newSession ? <NewSessionForm /> : <SignInForm />
}
