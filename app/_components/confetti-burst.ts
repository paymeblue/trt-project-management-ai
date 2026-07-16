import gsap from 'gsap'

// Small burst of confetti fired client-side on a genuine celebration moment
// (e.g. the sign_off step completing a project delivery). Self-contained:
// creates its own full-viewport overlay, animates pieces falling with gsap,
// and removes the overlay from the DOM once the animation finishes — no
// leaked nodes across repeated calls.

// Reuses the app's brand palette (app/globals.css @theme block) so the
// celebration feels on-brand rather than generic.
const CONFETTI_COLORS = ['#9d4300', '#f97316', '#09a4e8', '#006591', '#ffb690', '#c9e6ff']

const PIECE_COUNT = 50

export function fireConfetti(): void {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.inset = '0'
  container.style.pointerEvents = 'none'
  container.style.zIndex = '9999'
  container.style.overflow = 'hidden'
  document.body.appendChild(container)

  const viewportWidth = window.innerWidth

  const pieces: HTMLDivElement[] = []
  for (let i = 0; i < PIECE_COUNT; i++) {
    const piece = document.createElement('div')
    const size = 6 + Math.random() * 6
    piece.style.position = 'absolute'
    piece.style.top = '-20px'
    piece.style.left = `${viewportWidth / 2 + (Math.random() - 0.5) * 240}px`
    piece.style.width = `${size}px`
    piece.style.height = `${size}px`
    piece.style.backgroundColor = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
    piece.style.opacity = '1'
    container.appendChild(piece)
    pieces.push(piece)
  }

  const timeline = gsap.timeline({
    onComplete: () => {
      container.remove()
    },
  })

  pieces.forEach((piece, index) => {
    const fallDistance = window.innerHeight * (0.6 + Math.random() * 0.4)
    const drift = (Math.random() - 0.5) * 320
    const rotation = (Math.random() - 0.5) * 720
    const duration = 1.5 + Math.random()

    timeline.to(
      piece,
      {
        y: fallDistance,
        x: drift,
        rotation,
        duration,
        ease: 'power1.in',
      },
      Math.random() * 0.4,
    )
    timeline.to(
      piece,
      {
        opacity: 0,
        duration: 0.4,
        ease: 'power1.out',
      },
      `>-0.4`,
    )
  })
}
