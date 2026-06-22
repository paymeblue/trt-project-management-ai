'use client'

// Dispatches the global event the ChatDrawer listens for, so the chat can be
// opened straight from the dashboard.
export default function OpenChatButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('trt:open-chat'))}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary/90"
    >
      <span className="material-symbols-outlined text-[20px]">forum</span>
      Open Messages
    </button>
  )
}
