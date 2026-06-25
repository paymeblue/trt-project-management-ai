'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { MyWork } from '@/lib/workflow'

type MyWorkContext = MyWork & { refresh: () => void }

const Ctx = createContext<MyWorkContext>({
  activeProjects: [],
  pending: [],
  refresh: () => {},
})

export function useMyWork() {
  return useContext(Ctx)
}

const POLL_MS = 4000

// Keeps the header switcher + forcing gate near-real-time: seeds from the
// server-rendered snapshot, then polls /api/my-work on an interval, on window
// focus / tab visibility, and on every client navigation.
export default function MyWorkProvider({
  initial,
  children,
}: {
  initial: MyWork
  children: React.ReactNode
}) {
  const [data, setData] = useState<MyWork>(initial)
  const pathname = usePathname()

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/my-work', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as MyWork
      setData(json)
    } catch {
      // transient network error — keep last known state
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  // Refresh on navigation so completing a step and returning updates instantly.
  useEffect(() => {
    const t = setTimeout(refresh, 0)
    return () => clearTimeout(t)
  }, [pathname, refresh])

  return <Ctx.Provider value={{ ...data, refresh }}>{children}</Ctx.Provider>
}
