import { redirect } from 'next/navigation'

// Public sign-up is disabled — accounts are created by an administrator.
export default function SignUpPage() {
  redirect('/sign-in')
}
