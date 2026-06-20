'use client'

import { useRef, useState } from 'react'
import { gsap } from 'gsap'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function DaveAredo() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  function openChat() {
    setOpen(true)
    requestAnimationFrame(() => {
      if (panelRef.current) {
        gsap.fromTo(
          panelRef.current,
          { scale: 0.15, opacity: 0, transformOrigin: 'bottom right' },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' },
        )
      }
    })
  }

  function closeChat() {
    if (panelRef.current) {
      gsap.to(panelRef.current, {
        scale: 0.15,
        opacity: 0,
        transformOrigin: 'bottom right',
        duration: 0.3,
        ease: 'power3.in',
        onComplete: () => setOpen(false),
      })
    } else {
      setOpen(false)
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      setMessages((m) => [...m, { role: 'assistant', content: data.reply ?? '(no reply)' }])
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Network error reaching the assistant.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openChat}
        aria-label="Open Dave Aredo assistant"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white shadow-lg hover:bg-blue-700"
      >
        DA
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-40 flex flex-col bg-white"
      role="dialog"
      aria-label="Dave Aredo chat"
    >
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <p className="text-lg font-bold text-gray-900">Dave Aredo</p>
          <p className="text-xs text-gray-400">Your project-management assistant</p>
        </div>
        <button
          type="button"
          onClick={closeChat}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          Close
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <p className="mx-auto max-w-md text-center text-sm text-gray-400">
            Ask Dave about processes, checklists, or how to get something done.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-gray-400">Dave is thinking…</p>}
      </div>

      <div className="border-t border-gray-200 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="Message Dave Aredo…"
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
