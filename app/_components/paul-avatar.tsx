// AI-style avatar for Paul Arredo — a friendly assistant mark in the brand
// palette, with subtle SMIL animation (eyes drift, sparkle pulses). Pure SVG,
// no JS, scales crisply at any size.
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

      {/* antenna with a gentle blink */}
      <circle cx="24" cy="9" r="2.4" fill="#fff">
        <animate attributeName="opacity" values="1;0.4;1" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <rect x="23" y="10.5" width="2" height="4" rx="1" fill="#fff" opacity="0.9" />

      {/* head */}
      <rect x="12" y="14" width="24" height="19" rx="7" fill="#fff" />

      {/* eyes — the whole group drifts subtly, like the eyes are looking around */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 1.4 0.3; 0 0.8; -1.4 0.3; 0 0"
          keyTimes="0; 0.25; 0.5; 0.75; 1"
          dur="5s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1"
        />
        <circle cx="19.5" cy="23" r="2.6" fill="#9d4300" />
        <circle cx="28.5" cy="23" r="2.6" fill="#9d4300" />
        <circle cx="20.4" cy="22.1" r="0.8" fill="#fff" />
        <circle cx="29.4" cy="22.1" r="0.8" fill="#fff" />
      </g>

      {/* occasional blink: eyelids sweep down briefly */}
      <rect x="16" y="20" width="16" height="0" rx="2" fill="#fff">
        <animate
          attributeName="height"
          values="0;0;5;0;0"
          keyTimes="0;0.92;0.96;0.99;1"
          dur="5.5s"
          repeatCount="indefinite"
        />
      </rect>

      {/* smile */}
      <path
        d="M19 27.5 Q24 30.5 29 27.5"
        stroke="#9d4300"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* sparkle that pulses */}
      <path
        d="M37 30 l1.1 2.4 2.4 1.1 -2.4 1.1 -1.1 2.4 -1.1 -2.4 -2.4 -1.1 2.4 -1.1 Z"
        fill="#fff"
      >
        <animateTransform
          attributeName="transform"
          type="scale"
          additive="sum"
          values="1;1.25;1"
          dur="2s"
          repeatCount="indefinite"
          transform-origin="37 33"
        />
        <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}
