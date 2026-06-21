'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ChatUser = { id: string; name: string; role: string }
type Conversation = {
  conversationId: string
  other: ChatUser
  lastMessage: { preview: string; at: string } | null
  unread: number
}
type Msg = {
  id: string
  senderId: string
  senderName: string
  body: string
  attachmentData: string | null
  attachmentName: string | null
  attachmentType: string | null
  createdAt: string
}

const ROLE_LABEL: Record<string, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  super_admin: 'Super Admin',
}

function playPing() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.start()
    osc.stop(ctx.currentTime + 0.26)
  } catch {
    /* ignore */
  }
}

export default function ChatDrawer() {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<ChatUser[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [activeOther, setActiveOther] = useState<ChatUser | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [meId, setMeId] = useState('')
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<{ data: string; name: string; type: string } | null>(null)
  const [picking, setPicking] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastMsgId = useRef<string>('')
  const prevUnread = useRef<number>(0)

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch('/api/messages/conversations')
      if (!r.ok) return
      const d: { conversations: Conversation[]; totalUnread: number } = await r.json()
      setConversations(d.conversations)
      setTotalUnread(d.totalUnread)
      if (d.totalUnread > prevUnread.current && !open) playPing()
      prevUnread.current = d.totalUnread
    } catch {
      /* ignore */
    }
  }, [open])

  const loadMessages = useCallback(
    async (convId: string) => {
      try {
        const r = await fetch(`/api/messages?conversationId=${convId}`)
        if (!r.ok) return
        const d: { messages: Msg[]; meId: string } = await r.json()
        setMeId(d.meId)
        const latest = d.messages[d.messages.length - 1]
        if (latest && latest.id !== lastMsgId.current) {
          if (lastMsgId.current && latest.senderId !== d.meId) playPing()
          lastMsgId.current = latest.id
        }
        setMessages(d.messages)
      } catch {
        /* ignore */
      }
    },
    [],
  )

  // Poll conversations/unread badge every 6s (also when closed).
  useEffect(() => {
    const t = setTimeout(loadConversations, 0)
    const id = setInterval(loadConversations, 6000)
    return () => {
      clearTimeout(t)
      clearInterval(id)
    }
  }, [loadConversations])

  // Poll the active thread every 3s while open.
  useEffect(() => {
    if (!open || !activeConvId) return
    const run = () => loadMessages(activeConvId)
    const t = setTimeout(run, 0)
    const id = setInterval(run, 3000)
    return () => {
      clearTimeout(t)
      clearInterval(id)
    }
  }, [open, activeConvId, loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  function openDrawer() {
    setOpen(true)
    fetch('/api/messages/users')
      .then((r) => r.json())
      .then((d: { users: ChatUser[] }) => setUsers(d.users ?? []))
      .catch(() => {})
    loadConversations()
  }

  async function startChat(u: ChatUser) {
    setPicking(false)
    try {
      const r = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      })
      const d: { conversationId?: string } = await r.json()
      if (d.conversationId) {
        lastMsgId.current = ''
        setActiveConvId(d.conversationId)
        setActiveOther(u)
        setMessages([])
        loadConversations()
      }
    } catch {
      /* ignore */
    }
  }

  function openConversation(c: Conversation) {
    lastMsgId.current = ''
    setActiveConvId(c.conversationId)
    setActiveOther(c.other)
    setMessages([])
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4_200_000) return
    const reader = new FileReader()
    reader.onload = () =>
      setAttachment({
        data: typeof reader.result === 'string' ? reader.result : '',
        name: file.name,
        type: file.type,
      })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function send() {
    if (!activeConvId) return
    const text = input.trim()
    if (!text && !attachment) return
    setInput('')
    const att = attachment
    setAttachment(null)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConvId,
          body: text,
          attachmentData: att?.data ?? null,
          attachmentName: att?.name ?? null,
          attachmentType: att?.type ?? null,
        }),
      })
      loadMessages(activeConvId)
      loadConversations()
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open ? () => setOpen(false) : openDrawer}
        aria-label="Open messages"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-[20px]">chat</span>
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close messages"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          {/* Right-side drawer */}
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                {activeOther ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConvId(null)
                      setActiveOther(null)
                    }}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  </button>
                ) : (
                  <span className="material-symbols-outlined text-primary">forum</span>
                )}
                <div>
                  <p className="text-base font-bold text-gray-900">
                    {activeOther ? activeOther.name : 'Messages'}
                  </p>
                  {activeOther && (
                    <p className="text-xs text-gray-400">{ROLE_LABEL[activeOther.role] ?? activeOther.role}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </header>

            {!activeConvId ? (
              // Conversation list + new chat
              <div className="flex-1 overflow-y-auto">
                <div className="relative border-b border-gray-100 p-3">
                  <button
                    type="button"
                    onClick={() => setPicking((p) => !p)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    New message
                  </button>
                  {picking && (
                    <div className="absolute left-3 right-3 top-14 z-10 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {users.length === 0 && <p className="p-3 text-sm text-gray-400">No other users.</p>}
                      {users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => startChat(u)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {u.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="flex-1 truncate text-gray-900">{u.name}</span>
                          <span className="text-xs text-gray-400">{ROLE_LABEL[u.role] ?? u.role}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {conversations.length === 0 && (
                  <p className="p-4 text-sm text-gray-400">No conversations yet. Start one above.</p>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.conversationId}
                    type="button"
                    onClick={() => openConversation(c)}
                    className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {c.other.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900">{c.other.name}</span>
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                            {c.unread}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-gray-400">
                        {c.lastMessage?.preview || 'No messages yet'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              // Active thread
              <>
                <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 && (
                    <p className="text-center text-sm text-gray-400">No messages yet. Say hello 👋</p>
                  )}
                  {messages.map((m) => {
                    const mine = m.senderId === meId
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            mine ? 'bg-primary text-white' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {m.attachmentData &&
                            (m.attachmentType?.startsWith('image/') ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={m.attachmentData}
                                alt={m.attachmentName ?? 'image'}
                                className="mb-1 max-h-56 rounded-lg"
                              />
                            ) : (
                              <a
                                href={m.attachmentData}
                                download={m.attachmentName ?? 'file'}
                                className={`mb-1 flex items-center gap-1 underline ${mine ? 'text-white' : 'text-primary'}`}
                              >
                                <span className="material-symbols-outlined text-[16px]">attach_file</span>
                                {m.attachmentName}
                              </a>
                            ))}
                          {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="border-t border-gray-200 p-3">
                  {attachment && (
                    <div className="mb-2 flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
                      <span className="material-symbols-outlined text-[16px]">attach_file</span>
                      <span className="flex-1 truncate">{attachment.name}</span>
                      <button type="button" onClick={() => setAttachment(null)} className="text-gray-400 hover:text-error">
                        ✕
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100">
                      <span className="material-symbols-outlined text-[20px]">attach_file</span>
                      <input type="file" onChange={onFile} className="hidden" />
                    </label>
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
                      placeholder="Message…"
                      className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={send}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
