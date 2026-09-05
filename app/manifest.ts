import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TRT Arredo — Project Management',
    short_name: 'TRT PM',
    description: 'Industrial precision in architectural logistics.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Deliberate: PMs rotate tablets between portrait form-filling and
    // landscape review — do not lock orientation.
    orientation: 'any',
    theme_color: '#9d4300',
    background_color: '#f8f9ff',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
