'use client'

import { getTabToken } from '@/lib/use-tab-token'
import ProfileAvatarField from '@/app/_components/profile-avatar-field'

type ProfileFormProps = {
  initial: {
    avatarData: string | null
    name: string | null
    position: string | null
    bio: string | null
    email: string | null
  } | undefined
  positions: { slug: string; label: string }[]
  roleLabel: string
  action: (tabToken: string | null, formData: FormData) => Promise<void>
}

// First client wrapper of this shape in the codebase (RESEARCH.md Pattern
// 3): the Server Action reference is passed down as a prop, then bound here
// with the current tab's token before being handed to <form action>. This
// is what lets updateProfileAction resolve the PER-TAB user rather than
// whichever identity the shared cookie happens to hold in this browser.
export default function ProfileForm({ initial, positions, roleLabel, action }: ProfileFormProps) {
  const tabToken = getTabToken()
  const boundAction = action.bind(null, tabToken)

  return (
    <form
      action={boundAction}
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <ProfileAvatarField initial={initial?.avatarData ?? null} name={initial?.name ?? 'U'} />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
        <input
          name="name"
          defaultValue={initial?.name ?? ''}
          required
          minLength={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Position</label>
        <select
          name="position"
          defaultValue={initial?.position ?? ''}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">— none —</option>
          {positions.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">
          Choose your position from the recognized list. Some workflow steps are restricted to an
          exact position, so this gates whether those steps are available to you.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input
            value={initial?.email ?? ''}
            disabled
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
          <input
            value={roleLabel}
            disabled
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
        <textarea
          name="bio"
          defaultValue={initial?.bio ?? ''}
          rows={3}
          maxLength={500}
          placeholder="A line about you and your work."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
      >
        Save profile
      </button>
    </form>
  )
}
