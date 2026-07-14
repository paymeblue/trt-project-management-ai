'use client'

import { createContext, useContext, useState } from 'react'
// `import type` only — erased at compile time, so this does not pull the
// server-only lib/workflow-graph.ts module into the client bundle. Widened
// from WorkflowStep to LiveWorkflowStep (quick task 260714-b4t) so consumers
// can read requiredPosition/receiverRequiredPosition without a cast.
import type { LiveWorkflowStep } from '@/lib/workflow-graph'

const Ctx = createContext<LiveWorkflowStep[]>([])

// Client-side access to the live workflow steps (Phase 17, WF-06): seeded ONCE
// server-side from getLiveWorkflowSteps() in the (app) layout, no polling — the
// step graph doesn't change within a request the way my-work does.
export function useWorkflowSteps(): LiveWorkflowStep[] {
  return useContext(Ctx)
}

export default function WorkflowStepsProvider({
  initial,
  children,
}: {
  initial: LiveWorkflowStep[]
  children: React.ReactNode
}) {
  const [steps] = useState<LiveWorkflowStep[]>(initial)
  return <Ctx.Provider value={steps}>{children}</Ctx.Provider>
}
