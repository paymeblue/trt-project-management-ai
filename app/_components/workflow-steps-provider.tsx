'use client'

import { createContext, useContext, useState } from 'react'
import type { WorkflowStep } from '@/lib/workflow'

const Ctx = createContext<WorkflowStep[]>([])

// Client-side access to the live workflow steps (Phase 17, WF-06): seeded ONCE
// server-side from getLiveWorkflowSteps() in the (app) layout, no polling — the
// step graph doesn't change within a request the way my-work does.
export function useWorkflowSteps(): WorkflowStep[] {
  return useContext(Ctx)
}

export default function WorkflowStepsProvider({
  initial,
  children,
}: {
  initial: WorkflowStep[]
  children: React.ReactNode
}) {
  const [steps] = useState<WorkflowStep[]>(initial)
  return <Ctx.Provider value={steps}>{children}</Ctx.Provider>
}
