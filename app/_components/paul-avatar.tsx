// AI-style avatar for Paul Arredo — a friendly assistant mark in the brand
// palette. Pure SVG so it scales crisply at any size.
export default function PaulAvatar({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Paul Arredo">
      <defs>
        <linearGradient id="pa-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#9d4300" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#pa-bg)" />
      {/* antenna */}
      <circle cx="24" cy="9" r="2.4" fill="#fff" />
      <rect x="23" y="10.5" width="2" height="4" rx="1" fill="#fff" opacity="0.9" />
      {/* head */}
      <rect x="12" y="14" width="24" height="19" rx="7" fill="#fff" />
      {/* eyes */}
      <circle cx="19.5" cy="23" r="2.6" fill="#9d4300" />
      <circle cx="28.5" cy="23" r="2.6" fill="#9d4300" />
      <circle cx="20.4" cy="22.1" r="0.8" fill="#fff" />
      <circle cx="29.4" cy="22.1" r="0.8" fill="#fff" />
      {/* smile */}
      <path
        d="M19 27.5 Q24 30.5 29 27.5"
        stroke="#9d4300"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* sparkle */}
      <path
        d="M37 30 l1.1 2.4 2.4 1.1 -2.4 1.1 -1.1 2.4 -1.1 -2.4 -2.4 -1.1 2.4 -1.1 Z"
        fill="#fff"
      />
    </svg>
  )
}
