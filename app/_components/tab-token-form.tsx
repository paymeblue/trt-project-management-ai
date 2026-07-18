'use client'

import { getTabToken } from '@/lib/use-tab-token'

type TabTokenFormProps = Omit<React.ComponentProps<'form'>, 'action'> & {
  action: (tabToken: string | null, formData: FormData) => Promise<void>
}

// Server components can't read this tab's sessionStorage, so any
// <form action={serverAction}> rendered from one would lose the per-tab
// identity (Server Action POSTs carry no Authorization header —
// D-20.1-04-A). This client wrapper binds the current tab's token as the
// action's first argument, generalizing the profile-form.tsx pattern for
// plain uncontrolled forms.
export default function TabTokenForm({ action, ...props }: TabTokenFormProps) {
  return <form {...props} action={action.bind(null, getTabToken())} />
}
