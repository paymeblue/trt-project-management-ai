// Synthesized (no bundled audio asset — nothing to license/host) two-tone
// ring, looped like Teams/Zoom's incoming-call sound, for PendingCallGate.
// Uses the Web Audio API directly rather than an <audio> element since
// there's no file to point one at.
//
// Browser autoplay policy note: a fresh AudioContext starts (or is created)
// 'suspended' until the page has seen at least one user gesture (click,
// keypress, etc). resume() is called defensively on start(), but if the
// callee truly hasn't interacted with the page at all yet, the browser will
// keep it silent until they do — an unavoidable platform restriction, not a
// bug in this code. In practice a user already navigating this app has
// almost always triggered a gesture before any call notification can appear.
export type Ringtone = { start: () => void; stop: () => void }

export function createRingtone(): Ringtone {
  let ctx: AudioContext | null = null
  let cycleTimer: ReturnType<typeof setTimeout> | null = null
  let playing = false

  function beep(startAt: number, duration: number, freq: number) {
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // Short fade in/out on every beep avoids an audible click at the edges.
    const t0 = ctx.currentTime + startAt
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02)
    gain.gain.setValueAtTime(0.18, t0 + duration - 0.03)
    gain.gain.linearRampToValueAtTime(0, t0 + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + duration)
  }

  function cycle() {
    if (!playing || !ctx) return
    // Classic double-ring pattern, then a pause before repeating.
    beep(0, 0.4, 950)
    beep(0.5, 0.4, 950)
    cycleTimer = setTimeout(cycle, 2200)
  }

  return {
    start() {
      if (playing) return
      playing = true
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
      ctx.resume().catch(() => {
        // Blocked by autoplay policy — see module doc comment above.
      })
      cycle()
    },
    stop() {
      playing = false
      if (cycleTimer) clearTimeout(cycleTimer)
      cycleTimer = null
      if (ctx) {
        const closing = ctx
        ctx = null
        closing.close().catch(() => {
          // Already closed/closing — nothing to do.
        })
      }
    },
  }
}
