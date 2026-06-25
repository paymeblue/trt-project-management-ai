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

// Official TRT Arredo logo image. Theme-adaptive: brand colour in light mode,
// white in dark mode (see `.trt-logo-adaptive` in globals.css).
export function TrtLogo({ className = 'h-9 w-auto' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/trt-logo.webp"
      alt="TRT Arredo"
      className={`${className} trt-logo-adaptive object-contain`}
    />
  )
}

// The logo for the faint full-screen watermark. Theme-adaptive like the logo;
// caller sets size + opacity.
export function TrtWatermark({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/trt-logo.webp"
      alt=""
      aria-hidden="true"
      className={`${className} trt-logo-adaptive object-contain`}
    />
  )
}
