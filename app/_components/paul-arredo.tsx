'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Msg = { role: 'user' | 'assistant'; content: string }
type Session = { id: string; title: string; updatedAt: string }

// ── Minimal Web Speech API typings (no DOM lib coverage for webkit prefix) ──
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechResultEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ── Markdown bubble ─────────────────────────────────────────────────────────
function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: (props) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
        ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />,
        ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...props} />,
        li: (props) => <li className="leading-relaxed" {...props} />,
        strong: (props) => <strong className="font-semibold" {...props} />,
        em: (props) => <em className="italic" {...props} />,
        h1: (props) => <h1 className="mb-2 mt-1 text-base font-bold" {...props} />,
        h2: (props) => <h2 className="mb-2 mt-1 text-base font-bold" {...props} />,
        h3: (props) => <h3 className="mb-1 mt-1 text-sm font-bold" {...props} />,
        a: (props) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />,
        code: (props) => {
          const { children, className } = props as { children?: React.ReactNode; className?: string }
          const isBlock = (className ?? '').includes('language-')
          return isBlock ? (
            <code className="block overflow-x-auto rounded-md bg-gray-900 px-3 py-2 font-mono text-xs text-gray-100">
              {children}
            </code>
          ) : (
            <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
          )
        },
        pre: (props) => <pre className="mb-2" {...props} />,
        blockquote: (props) => (
          <blockquote className="mb-2 border-l-2 border-gray-300 pl-3 italic text-gray-600" {...props} />
        ),
        table: (props) => (
          <div className="mb-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs" {...props} />
          </div>
        ),
        th: (props) => <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold" {...props} />,
        td: (props) => <td className="border border-gray-300 px-2 py-1" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

export default function PaulArredo() {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [typing, setTyping] = useState<{ text: string; shown: number } | null>(null)
  const [listening, setListening] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechSupported = typeof window !== 'undefined' && getSpeechCtor() !== null

  const stopTypewriter = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = null
  }, [])

  // Reveal an assistant reply character-batch by batch, then commit it to the
  // thread. Driven by setTimeout callbacks (not a synchronous effect) so it
  // doesn't trigger cascading renders.
  const typewrite = useCallback((full: string) => {
    stopTypewriter()
    const step = Math.max(1, Math.round(full.length / 240))
    let shown = 0
    setTyping({ text: full, shown: 0 })
    const tick = () => {
      shown = Math.min(full.length, shown + step)
      if (shown >= full.length) {
        setMessages((m) => [...m, { role: 'assistant', content: full }])
        setTyping(null)
        typingTimer.current = null
      } else {
        setTyping({ text: full, shown })
        typingTimer.current = setTimeout(tick, 12)
      }
    }
    typingTimer.current = setTimeout(tick, 12)
  }, [stopTypewriter])

  useEffect(() => () => stopTypewriter(), [stopTypewriter])

  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/chat/sessions')
      if (!r.ok) return
      const d: { sessions?: Session[] } = await r.json()
      if (Array.isArray(d.sessions)) setSessions(d.sessions)
    } catch {
      /* ignore */
    }
  }, [])

  function openChat() {
    setOpen(true)
    loadSessions()
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

  function newChat() {
    stopTypewriter()
    setActiveSessionId(null)
    setMessages([])
    setTyping(null)
  }

  async function selectSession(id: string) {
    if (id === activeSessionId) return
    stopTypewriter()
    setActiveSessionId(id)
    setTyping(null)
    setMessages([])
    try {
      const r = await fetch(`/api/chat?sessionId=${encodeURIComponent(id)}`)
      const d: { messages?: Msg[] } = await r.json()
      if (Array.isArray(d.messages)) setMessages(d.messages)
    } catch {
      /* ignore */
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSessions((s) => s.filter((x) => x.id !== id))
    if (id === activeSessionId) newChat()
    try {
      await fetch(`/api/chat/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch {
      /* ignore */
    }
  }

  // Keep the thread scrolled to the bottom as content grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, typing, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading || typing) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: activeSessionId }),
      })
      const data: { reply?: string; sessionId?: string } = await res.json()
      if (data.sessionId) setActiveSessionId(data.sessionId)
      setLoading(false)
      typewrite(data.reply ?? '(no reply)')
      loadSessions()
    } catch {
      setLoading(false)
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Network error reaching the assistant.' },
      ])
    }
  }

  function toggleMic() {
    const Ctor = getSpeechCtor()
    if (!Ctor) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? ''
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openChat}
        aria-label="Open Paul Arredo assistant"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-white shadow-lg hover:bg-primary/90"
      >
        PA
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-40 flex bg-white"
      role="dialog"
      aria-label="Paul Arredo chat"
    >
      {/* Sidebar — conversation history (Claude-style) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 md:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={newChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New chat
          </button>
        </div>
        <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          History
        </p>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {sessions.length === 0 && (
            <p className="px-2 py-2 text-xs text-gray-400">No previous chats yet.</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSession(s.id)}
              className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                s.id === activeSessionId
                  ? 'bg-gray-200 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="material-symbols-outlined text-base text-gray-400">chat_bubble</span>
              <span className="flex-1 truncate">{s.title}</span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => deleteSession(s.id, e)}
                aria-label="Delete chat"
                className="material-symbols-outlined hidden text-base text-gray-400 hover:text-error group-hover:inline"
              >
                delete
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              PA
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">Paul Arredo</p>
              <p className="text-xs text-gray-400">PMI-certified project-management assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={newChat}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 md:hidden"
            >
              New
            </button>
            <button
              type="button"
              onClick={closeChat}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {messages.length === 0 && !typing && !loading && (
            <p className="mx-auto max-w-md text-center text-sm text-gray-400">
              Ask Paul about processes, checklists, risk, scheduling, or how to get something done.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'whitespace-pre-wrap bg-primary text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {m.role === 'user' ? m.content : <Markdown>{m.content}</Markdown>}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-gray-800">
                {typing.text.slice(0, typing.shown)}
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-gray-500 align-middle" />
              </div>
            </div>
          )}
          {loading && <p className="text-sm text-gray-400">Paul is thinking…</p>}
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            {speechSupported && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
                  listening
                    ? 'border-error bg-error text-white animate-pulse'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="material-symbols-outlined text-xl">{listening ? 'stop' : 'mic'}</span>
              </button>
            )}
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
              placeholder={listening ? 'Listening…' : 'Message Paul Arredo…'}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !!typing}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
