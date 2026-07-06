'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Drawer } from 'vaul'
import { gsap } from 'gsap'
import { userRoleLabel } from '@/lib/workflow'

type ChatUser = { id: string; name: string; role: string; email?: string }
type Reaction = { emoji: string; count: number; mine: boolean }
type Conversation = {
  conversationId: string
  other: ChatUser
  others?: ChatUser[]
  isGroup?: boolean
  title?: string | null
  name?: string
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
  reactions?: Reaction[]
}
type Typer = { id: string; name: string }

// A small hand-picked grid of native emoji characters — no emoji-mart / heavy deps.
const EMOJIS = [
  '😀', '😂', '😅', '😊', '😍', '🤔', '😎', '🙌', '👏', '🙏',
  '👍', '👎', '👋', '🤝', '💪', '🔥', '🎉', '✅', '❌', '❓',
  '❤️', '💯', '⭐', '🚀', '📌', '📎', '📷', '⏰', '⚠️', '💡',
  '😢', '😡', '😴', '🤯', '🥳', '👀', '🙈', '🤞', '👌', '✨',
]

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

function EmojiPopover({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
      <div className="grid grid-cols-8 gap-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              onPick(e)
              onClose()
            }}
            className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-gray-100"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Conversation list + "New message" (direct/group) panel ─────────────────
// Declared at module scope (not nested inside ChatDrawer) so React keeps a
// stable component identity across parent re-renders — avoids remounting the
// list (and losing scroll/input state) on every poll tick.
function ConversationList({
  users,
  conversations,
  picking,
  setPicking,
  composerMode,
  setComposerMode,
  groupSelected,
  toggleGroupUser,
  groupTitle,
  setGroupTitle,
  createGroup,
  startChat,
  openConversation,
}: {
  users: ChatUser[]
  conversations: Conversation[]
  picking: boolean
  setPicking: (updater: (p: boolean) => boolean) => void
  composerMode: 'direct' | 'group'
  setComposerMode: (m: 'direct' | 'group') => void
  groupSelected: string[]
  toggleGroupUser: (id: string) => void
  groupTitle: string
  setGroupTitle: (v: string) => void
  createGroup: () => void
  startChat: (u: ChatUser) => void
  openConversation: (c: Conversation) => void
}) {
  return (
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
          <div className="absolute left-3 right-3 top-14 z-10 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex border-b border-gray-100">
              <button
                type="button"
                onClick={() => setComposerMode('direct')}
                className={`flex-1 px-3 py-2 text-xs font-semibold ${
                  composerMode === 'direct' ? 'border-b-2 border-primary text-primary' : 'text-gray-400'
                }`}
              >
                Direct
              </button>
              <button
                type="button"
                onClick={() => setComposerMode('group')}
                className={`flex-1 px-3 py-2 text-xs font-semibold ${
                  composerMode === 'group' ? 'border-b-2 border-primary text-primary' : 'text-gray-400'
                }`}
              >
                Group
              </button>
            </div>

            {composerMode === 'group' && (
              <div className="border-b border-gray-100 p-2">
                <input
                  type="text"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="Group name (optional)"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            )}

            {users.length === 0 && <p className="p-3 text-sm text-gray-400">No other users.</p>}
            {users.map((u) =>
              composerMode === 'direct' ? (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => startChat(u)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-gray-900">{u.name}</span>
                    <span className="block truncate text-xs text-gray-400">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{userRoleLabel(u.role)}</span>
                </button>
              ) : (
                <label
                  key={u.id}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={groupSelected.includes(u.id)}
                    onChange={() => toggleGroupUser(u.id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-gray-900">{u.name}</span>
                    <span className="block truncate text-xs text-gray-400">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{userRoleLabel(u.role)}</span>
                </label>
              ),
            )}
            {composerMode === 'group' && (
              <div className="p-2">
                <button
                  type="button"
                  disabled={groupSelected.length < 2}
                  onClick={createGroup}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Create group{groupSelected.length > 0 ? ` (${groupSelected.length})` : ''}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {conversations.length === 0 && (
        <p className="p-4 text-sm text-gray-400">No conversations yet. Start one above.</p>
      )}
      {conversations.map((c) => {
        const label = c.isGroup ? c.name || c.title || 'Group chat' : c.other.name
        const avatarLetter = (c.isGroup ? label : c.other.name).slice(0, 1).toUpperCase()
        return (
          <button
            key={c.conversationId}
            type="button"
            onClick={() => openConversation(c)}
            className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {c.isGroup ? <span className="material-symbols-outlined text-[18px]">group</span> : avatarLetter}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-gray-900">{label}</span>
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
        )
      })}
    </div>
  )
}

// ── Message thread (bubbles, sender names, reactions) ───────────────────────
function MessageThread({
  scrollRef,
  messages,
  meId,
  isGroup,
  reactionPickerFor,
  setReactionPickerFor,
  toggleReaction,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  messages: Msg[]
  meId: string
  isGroup: boolean
  reactionPickerFor: string | null
  setReactionPickerFor: (id: string | null) => void
  toggleReaction: (messageId: string, emoji: string) => void
}) {
  // Flip the reaction picker below the button when the message sits too close
  // to the top of the scroll area — otherwise the drawer header covers it.
  const [pickerBelow, setPickerBelow] = useState(false)
  return (
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 && (
        <p className="text-center text-sm text-gray-400">No messages yet. Say hello 👋</p>
      )}
      {messages.map((m) => {
        const mine = m.senderId === meId
        const showSenderName = isGroup && !mine
        return (
          <div key={m.id} className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
            {showSenderName && <span className="mb-0.5 pl-1 text-xs text-gray-400">{m.senderName}</span>}
            <div className="relative flex max-w-[80%] items-start gap-1">
              <div
                className={`rounded-2xl px-3 py-2 text-sm ${
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
              <div className="relative shrink-0 self-center opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => {
                    if (reactionPickerFor === m.id) {
                      setReactionPickerFor(null)
                      return
                    }
                    const btnTop = e.currentTarget.getBoundingClientRect().top
                    const areaTop = scrollRef.current?.getBoundingClientRect().top ?? 0
                    setPickerBelow(btnTop - areaTop < 110)
                    setReactionPickerFor(m.id)
                  }}
                  aria-label="Add reaction"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <span className="material-symbols-outlined text-[16px]">add_reaction</span>
                </button>
                {reactionPickerFor === m.id && (
                  <div
                    className={`absolute right-0 z-20 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg ${
                      pickerBelow ? 'top-full mt-1' : 'bottom-full mb-1'
                    }`}
                  >
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJIS.slice(0, 16).map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            toggleReaction(m.id, e)
                            setReactionPickerFor(null)
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-gray-100"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {m.reactions && m.reactions.length > 0 && (
              <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                {m.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => toggleReaction(m.id, r.emoji)}
                    className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                      r.mine
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`}
                  >
                    <span>{r.emoji}</span>
                    <span>{r.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Composer (attach, emoji picker, typing heartbeat, send) ─────────────────
function MessageComposer({
  input,
  onComposerChange,
  onFile,
  attachment,
  clearAttachment,
  emojiPickerOpen,
  setEmojiPickerOpen,
  insertEmoji,
  send,
  typingLabel,
}: {
  input: string
  onComposerChange: (value: string) => void
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  attachment: { data: string; name: string; type: string } | null
  clearAttachment: () => void
  emojiPickerOpen: boolean
  setEmojiPickerOpen: (updater: (p: boolean) => boolean) => void
  insertEmoji: (emoji: string) => void
  send: () => void
  typingLabel: string | null
}) {
  return (
    <div className="border-t border-gray-200 p-3">
      {typingLabel && <p className="mb-1 pl-1 text-xs italic text-gray-400">{typingLabel}</p>}
      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
          <span className="material-symbols-outlined text-[16px]">attach_file</span>
          <span className="flex-1 truncate">{attachment.name}</span>
          <button type="button" onClick={clearAttachment} className="text-gray-400 hover:text-error">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100">
          <span className="material-symbols-outlined text-[20px]">attach_file</span>
          <input type="file" onChange={onFile} className="hidden" />
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setEmojiPickerOpen((p) => !p)}
            aria-label="Insert emoji"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          >
            <span className="material-symbols-outlined text-[20px]">mood</span>
          </button>
          {emojiPickerOpen && (
            <EmojiPopover onPick={insertEmoji} onClose={() => setEmojiPickerOpen(() => false)} />
          )}
        </div>
        <textarea
          value={input}
          onChange={(e) => onComposerChange(e.target.value)}
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
  )
}

export default function ChatDrawer() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [users, setUsers] = useState<ChatUser[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [activeOther, setActiveOther] = useState<ChatUser | null>(null)
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [typers, setTypers] = useState<Typer[]>([])
  const [meId, setMeId] = useState('')
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<{ data: string; name: string; type: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [composerMode, setComposerMode] = useState<'direct' | 'group'>('direct')
  const [groupSelected, setGroupSelected] = useState<string[]>([])
  const [groupTitle, setGroupTitle] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const fullscreenScrollRef = useRef<HTMLDivElement>(null)
  const lastMsgId = useRef<string>('')
  const prevUnread = useRef<number>(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastTypingPingAt = useRef<number>(0)

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

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const r = await fetch(`/api/messages?conversationId=${convId}`)
      if (!r.ok) return
      const d: { messages: Msg[]; meId: string; typers?: Typer[] } = await r.json()
      setMeId(d.meId)
      const latest = d.messages[d.messages.length - 1]
      if (latest && latest.id !== lastMsgId.current) {
        if (lastMsgId.current && latest.senderId !== d.meId) playPing()
        lastMsgId.current = latest.id
      }
      setMessages(d.messages)
      setTypers(d.typers ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  // Poll conversations/unread badge every 6s (also when closed).
  useEffect(() => {
    const t = setTimeout(loadConversations, 0)
    const id = setInterval(loadConversations, 6000)
    return () => {
      clearTimeout(t)
      clearInterval(id)
    }
  }, [loadConversations])

  // Poll the active thread every 2s while open (tightened from 3s so typers/reactions feel live).
  useEffect(() => {
    if (!open || !activeConvId) return
    const run = () => loadMessages(activeConvId)
    const t = setTimeout(run, 0)
    const id = setInterval(run, 2000)
    return () => {
      clearTimeout(t)
      clearInterval(id)
    }
  }, [open, activeConvId, loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    fullscreenScrollRef.current?.scrollTo({ top: fullscreenScrollRef.current.scrollHeight })
  }, [messages])

  // Allow opening the chat from anywhere (e.g. a dashboard "Messages" tile).
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('trt:open-chat', handler)
    return () => window.removeEventListener('trt:open-chat', handler)
  }, [])

  // Whenever the drawer opens (via trigger or event), load users + conversations.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      fetch('/api/messages/users')
        .then((r) => r.json())
        .then((d: { users: ChatUser[] }) => setUsers(d.users ?? []))
        .catch(() => {})
      loadConversations()
    }, 0)
    return () => clearTimeout(t)
  }, [open, loadConversations])

  function onOpenChange(o: boolean) {
    setOpen(o)
    if (!o) setExpanded(false)
  }

  function resetGroupPicker() {
    setComposerMode('direct')
    setGroupSelected([])
    setGroupTitle('')
    setPicking(false)
  }

  async function startChat(u: ChatUser) {
    resetGroupPicker()
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
        setActiveConv(null)
        setMessages([])
        setTypers([])
        loadConversations()
      }
    } catch {
      /* ignore */
    }
  }

  function toggleGroupUser(id: string) {
    setGroupSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  async function createGroup() {
    if (groupSelected.length < 2) return
    try {
      const r = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: groupSelected, title: groupTitle.trim() || undefined }),
      })
      const d: { conversationId?: string } = await r.json()
      if (d.conversationId) {
        // Optimistic thread header — the polled conversations list catches up later.
        const title = groupTitle.trim()
        const members = users.filter((u) => groupSelected.includes(u.id))
        lastMsgId.current = ''
        resetGroupPicker()
        setActiveConvId(d.conversationId)
        setActiveOther(null)
        setActiveConv({
          conversationId: d.conversationId,
          other: members[0],
          others: members,
          isGroup: true,
          title: title || null,
          name: title || 'Group chat',
          lastMessage: null,
          unread: 0,
        })
        setMessages([])
        setTypers([])
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
    setActiveConv(c)
    setMessages([])
    setTypers([])
  }

  function backToList() {
    setActiveConvId(null)
    setActiveOther(null)
    setActiveConv(null)
    setTypers([])
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

  function onComposerChange(value: string) {
    setInput(value)
    if (!activeConvId) return
    const now = Date.now()
    if (now - lastTypingPingAt.current < 2500) return
    lastTypingPingAt.current = now
    fetch('/api/messages/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeConvId }),
    }).catch(() => {})
  }

  function insertEmoji(emoji: string) {
    setInput((cur) => cur + emoji)
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      await fetch('/api/messages/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      })
      if (activeConvId) loadMessages(activeConvId)
    } catch {
      /* ignore */
    }
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

  function expandChat() {
    setExpanded(true)
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

  function collapseChat() {
    if (panelRef.current) {
      gsap.to(panelRef.current, {
        scale: 0.15,
        opacity: 0,
        transformOrigin: 'bottom right',
        duration: 0.3,
        ease: 'power3.in',
        onComplete: () => setExpanded(false),
      })
    } else {
      setExpanded(false)
    }
  }

  const headerName = activeConv?.isGroup
    ? activeConv.name || activeConv.title || 'Group chat'
    : activeOther?.name

  const otherTypers = typers.filter((t) => t.id !== meId)
  const typingLabel =
    otherTypers.length === 0
      ? null
      : otherTypers.length === 1
        ? `${otherTypers[0].name} is typing…`
        : 'Several people are typing…'

  // ── Fullscreen Slack-like layout: sidebar (conversation list) + thread ──

  if (expanded) {
    // Portal to <body>: the header this component mounts in creates a sticky
    // stacking context that would otherwise paint page content over the panel.
    return createPortal(
      <div ref={panelRef} className="fixed inset-0 z-50 flex bg-white" role="dialog" aria-label="Team chat">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50 md:flex">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <span className="flex items-center gap-2 text-base font-bold text-gray-900">
              <span className="material-symbols-outlined text-primary">forum</span>
              Messages
            </span>
            <button
              type="button"
              onClick={collapseChat}
              aria-label="Collapse chat"
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200"
            >
              <span className="material-symbols-outlined text-[18px]">close_fullscreen</span>
            </button>
          </div>
          <ConversationList
            users={users}
            conversations={conversations}
            picking={picking}
            setPicking={setPicking}
            composerMode={composerMode}
            setComposerMode={setComposerMode}
            groupSelected={groupSelected}
            toggleGroupUser={toggleGroupUser}
            groupTitle={groupTitle}
            setGroupTitle={setGroupTitle}
            createGroup={createGroup}
            startChat={startChat}
            openConversation={openConversation}
          />
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              {activeConvId && (
                <button
                  type="button"
                  onClick={backToList}
                  className="flex items-center text-primary hover:underline md:hidden"
                  aria-label="Back to conversations"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
              )}
              <div>
                <p className="text-base font-bold text-gray-900">
                  {activeConvId ? headerName || 'Conversation' : 'Select a conversation'}
                </p>
                {activeConv?.isGroup && activeConv.others && (
                  <p className="text-xs text-gray-400">{activeConv.others.length + 1} participants</p>
                )}
                {!activeConv?.isGroup && activeOther && (
                  <p className="text-xs text-gray-400">
                    {userRoleLabel(activeOther.role)}
                    {activeOther.email ? ` · ${activeOther.email}` : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={collapseChat}
              aria-label="Collapse chat"
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 md:hidden"
            >
              <span className="material-symbols-outlined text-[18px]">close_fullscreen</span>
            </button>
          </header>

          {activeConvId ? (
            <>
              <MessageThread
                scrollRef={fullscreenScrollRef}
                messages={messages}
                meId={meId}
                isGroup={!!activeConv?.isGroup}
                reactionPickerFor={reactionPickerFor}
                setReactionPickerFor={setReactionPickerFor}
                toggleReaction={toggleReaction}
              />
              <MessageComposer
                input={input}
                onComposerChange={onComposerChange}
                onFile={onFile}
                attachment={attachment}
                clearAttachment={() => setAttachment(null)}
                emojiPickerOpen={emojiPickerOpen}
                setEmojiPickerOpen={setEmojiPickerOpen}
                insertEmoji={insertEmoji}
                send={send}
                typingLabel={typingLabel}
              />
            </>
          ) : (
            <div className="flex-1 md:hidden">
              <ConversationList
                users={users}
                conversations={conversations}
                picking={picking}
                setPicking={setPicking}
                composerMode={composerMode}
                setComposerMode={setComposerMode}
                groupSelected={groupSelected}
                toggleGroupUser={toggleGroupUser}
                groupTitle={groupTitle}
                setGroupTitle={setGroupTitle}
                createGroup={createGroup}
                startChat={startChat}
                openConversation={openConversation}
              />
            </div>
          )}
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <Drawer.Root direction="right" open={open} onOpenChange={onOpenChange}>
      <Drawer.Trigger asChild>
        <button
          type="button"
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
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full outline-none sm:w-1/2"
          style={{ ['--initial-transform' as string]: '100%' }}
        >
          <div ref={panelRef} className="flex h-full w-full flex-col bg-white">
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                {activeConvId ? (
                  <button
                    type="button"
                    onClick={backToList}
                    className="flex items-center text-primary hover:underline"
                    aria-label="Back to conversations"
                  >
                    <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                  </button>
                ) : (
                  <span className="material-symbols-outlined text-primary">forum</span>
                )}
                <div>
                  <Drawer.Title className="text-base font-bold text-gray-900">
                    {activeConvId ? headerName || 'Conversation' : 'Messages'}
                  </Drawer.Title>
                  {activeConv?.isGroup && activeConv.others && (
                    <p className="text-xs text-gray-400">{activeConv.others.length + 1} participants</p>
                  )}
                  {!activeConv?.isGroup && activeOther && (
                    <p className="text-xs text-gray-400">
                      {userRoleLabel(activeOther.role)}
                      {activeOther.email ? ` · ${activeOther.email}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={expandChat}
                  aria-label="Expand chat"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_full</span>
                </button>
                <Drawer.Close asChild>
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Close
                  </button>
                </Drawer.Close>
              </div>
            </header>
            <Drawer.Description className="sr-only">Team messages, direct and group.</Drawer.Description>

            {!activeConvId ? (
              <ConversationList
                users={users}
                conversations={conversations}
                picking={picking}
                setPicking={setPicking}
                composerMode={composerMode}
                setComposerMode={setComposerMode}
                groupSelected={groupSelected}
                toggleGroupUser={toggleGroupUser}
                groupTitle={groupTitle}
                setGroupTitle={setGroupTitle}
                createGroup={createGroup}
                startChat={startChat}
                openConversation={openConversation}
              />
            ) : (
              <>
                <MessageThread
                  scrollRef={scrollRef}
                  messages={messages}
                  meId={meId}
                  isGroup={!!activeConv?.isGroup}
                  reactionPickerFor={reactionPickerFor}
                  setReactionPickerFor={setReactionPickerFor}
                  toggleReaction={toggleReaction}
                />
                <MessageComposer
                  input={input}
                  onComposerChange={onComposerChange}
                  onFile={onFile}
                  attachment={attachment}
                  clearAttachment={() => setAttachment(null)}
                  emojiPickerOpen={emojiPickerOpen}
                  setEmojiPickerOpen={setEmojiPickerOpen}
                  insertEmoji={insertEmoji}
                  send={send}
                  typingLabel={typingLabel}
                />
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
