'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verifyConfigPinAction, type ConfigActionState } from '@/actions/workflow-config'
import { getTabToken } from '@/lib/use-tab-token'

export default function ConfiguratorPinGate({ hint }: { hint: string }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [state, setState] = useState<ConfigActionState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const [showHint, setShowHint] = useState(false)

  function submit() {
    if (!pin.trim()) {
      setState({ status: 'error', message: 'Enter the configuration PIN.' })
      return
    }
    startTransition(async () => {
      const res = await verifyConfigPinAction(getTabToken(), pin)
      setState(res)
      if (res.status === 'success') {
        setPin('')
        router.refresh()
      }
    })
  }

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">lock</span>
        <h2 className="text-base font-semibold text-gray-900">Enter configuration PIN</h2>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        This is separate from your login — it protects the workflow configurator from being
        changed by accident.
      </p>
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="PIN"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:border-primary focus:outline-none"
        autoFocus
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {pending && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        Unlock
      </button>

      {state.status === 'error' && (
        <p className="mt-2 text-center text-xs text-error">{state.message}</p>
      )}

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setShowHint((s) => !s)}
          className="text-xs text-gray-400 underline hover:text-gray-600"
        >
          {showHint ? 'Hide hint' : 'Forgot the PIN? Show hint'}
        </button>
        {showHint && <p className="mt-1 text-xs font-semibold text-gray-600">Hint: {hint}</p>}
      </div>
    </div>
  )
}
