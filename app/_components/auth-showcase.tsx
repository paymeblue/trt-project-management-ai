import { TrtMark } from '@/app/_components/trt-logo'

// Right-hand brand panel for the auth pages: an animated, TRT-flavoured
// dashboard preview over a brand gradient. Uses explicit colors (not gray-*
// utilities) so the app's dark-mode token overrides never wash out the text.
export default function AuthShowcase() {
  return (
    <div className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#b9510a] to-[#7a3500] p-10 lg:flex lg:flex-col">
      {/* Animated background blobs + watermark */}
      <div className="pointer-events-none absolute inset-0">
        <div className="trt-blob absolute -left-16 top-10 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="trt-blob absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-black/10 blur-2xl" style={{ animationDelay: '4s' }} />
        <div className="absolute -right-24 -top-24 opacity-10">
          <TrtMark className="h-96 w-96" />
        </div>
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <h2 className="trt-rise max-w-md text-3xl font-extrabold leading-tight text-white">
          Industrial precision, from the floor to the site.
        </h2>
        <p className="trt-rise mt-3 max-w-md text-sm text-white/80" style={{ animationDelay: '0.1s' }}>
          Replace paper checklists with structured, photo-backed records — every delivery,
          verification and readiness check, in one system.
        </p>

        {/* Dashboard mockup */}
        <div className="relative mt-10 flex-1">
          {/* Stat cards row */}
          <div className="trt-rise grid grid-cols-2 gap-3" style={{ animationDelay: '0.2s' }}>
            <div className="trt-float rounded-2xl bg-[#ffffff] p-4 shadow-xl">
              <p className="text-[11px] font-medium text-[#6b7280]">Projects delivered</p>
              <p className="mt-1 text-2xl font-extrabold text-[#111827]">1,284</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803d]">
                ▲ 8% this month
              </span>
            </div>
            <div className="trt-float-slow rounded-2xl bg-[#ffffff] p-4 shadow-xl" style={{ animationDelay: '1s' }}>
              <p className="text-[11px] font-medium text-[#6b7280]">On-time rate</p>
              <p className="mt-1 text-2xl font-extrabold text-[#111827]">96.2%</p>
              <svg viewBox="0 0 120 36" className="mt-1 h-9 w-full">
                <defs>
                  <linearGradient id="trt-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 28 L20 22 L40 26 L60 14 L80 18 L100 8 L120 12 L120 36 L0 36 Z" fill="url(#trt-area)" />
                <path
                  d="M0 28 L20 22 L40 26 L60 14 L80 18 L100 8 L120 12"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: 260, strokeDashoffset: 260, animation: 'trt-draw 1.6s ease-out 0.5s forwards' }}
                />
              </svg>
            </div>
          </div>

          {/* Floating gauge card */}
          <div className="trt-float absolute -bottom-2 right-2 w-52 rounded-2xl bg-[#ffffff] p-4 shadow-2xl" style={{ animationDelay: '0.5s' }}>
            <p className="text-[11px] font-medium text-[#6b7280]">Production readiness</p>
            <div className="mt-2 flex items-center justify-center">
              <svg viewBox="0 0 100 56" className="h-20 w-32">
                <path d="M8 52 A44 44 0 0 1 92 52" fill="none" stroke="#eaeaea" strokeWidth="10" strokeLinecap="round" />
                <path
                  d="M8 52 A44 44 0 0 1 92 52"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="10"
                  strokeLinecap="round"
                  style={{ strokeDasharray: 138, strokeDashoffset: 138, animation: 'trt-draw 1.4s ease-out 0.8s forwards' }}
                />
                <text x="50" y="48" textAnchor="middle" fill="#111827" className="text-[16px] font-extrabold">92%</text>
              </svg>
            </div>
          </div>

          {/* Mini table card */}
          <div className="trt-rise mt-4 w-[64%] rounded-2xl bg-[#ffffff] p-4 shadow-xl" style={{ animationDelay: '0.35s' }}>
            <p className="mb-2 text-[11px] font-semibold text-[#374151]">Recent checklists</p>
            {[
              ['Confirmation · Unit A', 'Submitted'],
              ['Production · Kitchen', 'Submitted'],
              ['Site readiness · B2', 'Pending'],
            ].map(([label, status]) => (
              <div key={label} className="flex items-center justify-between border-t border-[#f1f1f1] py-1.5 first:border-0">
                <span className="text-[11px] text-[#4b5563]">{label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    status === 'Submitted' ? 'bg-[#ecfdf5] text-[#15803d]' : 'bg-[#fffbeb] text-[#b45309]'
                  }`}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
