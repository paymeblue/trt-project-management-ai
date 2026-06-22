'use client'

import { useState } from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

// Password input with a show/hide eye toggle.
export default function PasswordInput({ className = '', ...props }: Props) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-0.5 text-gray-400 hover:text-gray-600"
        tabIndex={-1}
      >
        <span className="material-symbols-outlined text-[20px]">
          {show ? 'visibility_off' : 'visibility'}
        </span>
      </button>
    </div>
  )
}
