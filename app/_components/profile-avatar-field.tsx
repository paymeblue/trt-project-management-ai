'use client'

import { useState } from 'react'
import { downscaleImage } from '@/lib/downscale-image'

export default function ProfileAvatarField({
  initial,
  name,
}: {
  initial: string | null
  name: string
}) {
  const [avatar, setAvatar] = useState(initial ?? '')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    try {
      setAvatar(await downscaleImage(file))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-center gap-4">
      {/* The value travels with the form's FormData */}
      <input type="hidden" name="avatarData" value={avatar} />
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl font-bold text-primary">{(name || 'U').slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Profile photo</label>
        <input
          type="file"
          accept="image/*"
          onChange={onFile}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
        />
        {avatar && (
          <button
            type="button"
            onClick={() => setAvatar('')}
            className="mt-1 text-xs text-gray-500 hover:text-error"
          >
            Remove photo
          </button>
        )}
      </div>
    </div>
  )
}
