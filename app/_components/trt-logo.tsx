// TRT Arredo logo lockup — a drafting-compass mark (nods to architectural
// precision) + wordmark. Pure SVG so it renders before fonts load.
export function TrtMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="TRT Arredo">
      <defs>
        <linearGradient id="trt-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#9d4300" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#trt-mark)" />
      {/* drafting compass */}
      <circle cx="20" cy="11" r="2.3" fill="#fff" />
      <path d="M20 12.5 L13.5 28.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 12.5 L26.5 28.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16.4 21.5 L23.6 21.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="13.5" cy="28.5" r="1.6" fill="#fff" />
      <circle cx="26.5" cy="28.5" r="1.6" fill="#fff" />
    </svg>
  )
}

export function TrtLogo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <TrtMark className="h-9 w-9" />
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-gray-900'}`}>
        TRT <span className="text-primary">Arredo</span>
      </span>
    </div>
  )
}
