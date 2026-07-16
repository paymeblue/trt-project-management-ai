import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { readinessForms, projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import ReadinessForm from '@/app/_components/readiness-form'
import { findStep, canActOnGraphStep, type UserRole } from '@/lib/workflow'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'

export const dynamic = 'force-dynamic'

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; step?: string }>
}) {
  const { userId, role } = await verifySession()
  const sp = await searchParams

  const projectId = typeof sp.projectId === 'string' ? sp.projectId : null
  const stepN = sp.step ? Number(sp.step) : null

  let workflowProjectId: string | null = null
  let workflowStepN: number | null = null
  let workflowNotice: string | null = null
  let workflowProjectName = ''

  if (projectId && stepN) {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    const steps = await getLiveWorkflowSteps()
    const step = findStep(steps, stepN)
    if (!proj || !step || step.kind !== 'readiness') {
      workflowNotice = 'This project step could not be found.'
    } else if (proj.currentStep !== stepN) {
      workflowNotice =
        proj.currentStep > stepN
          ? 'This step has already been completed for this project.'
          : 'This step is not active yet for this project.'
    } else if (!canActOnGraphStep(step, role as UserRole)) {
      workflowNotice = 'It is not your turn to act on this step.'
    } else {
      workflowProjectId = projectId
      workflowStepN = stepN
      workflowProjectName = proj.name
    }
  }

  const submissions = await db
    .select({
      id: readinessForms.id,
      mode: readinessForms.mode,
      project: readinessForms.project,
      unit: readinessForms.unit,
      confirmedBy: readinessForms.confirmedBy,
      createdAt: readinessForms.createdAt,
    })
    .from(readinessForms)
    .where(eq(readinessForms.createdBy, userId))
    .orderBy(desc(readinessForms.createdAt))
    .limit(50)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a
        href={workflowProjectId ? '/factory-pm/projects' : '/factory-pm/dashboard'}
        className="text-sm text-primary hover:underline"
      >
        ← {workflowProjectId ? 'Back to projects' : 'Dashboard'}
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Materials / Accessories Readiness Form</h1>
      <p className="mb-6 text-sm text-gray-500">
        Upload a photo of the signed paper form, or create a digital version and sign on screen.
      </p>

      {workflowNotice && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {workflowNotice}{' '}
          <a href="/factory-pm/projects" className="font-semibold underline">
            Back to projects
          </a>
        </div>
      )}

      {workflowProjectId && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary">
          Submitting this form will advance the project to its next step.
        </div>
      )}

      <ReadinessForm
        projectId={workflowProjectId}
        expectedStepN={workflowStepN}
        returnTo={workflowProjectId ? '/factory-pm/projects' : null}
        initialProject={workflowProjectName}
      />

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-900">Your submissions</h2>
      <div className="space-y-2">
        {submissions.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        {submissions.map((s) => (
          <a
            key={s.id}
            href={`/factory-pm/readiness/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-primary hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  s.mode === 'upload'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-green-50 text-green-700'
                }`}
              >
                {s.mode === 'upload' ? 'Uploaded' : 'Digital'}
              </span>
              <span className="font-medium text-gray-900">{s.project || 'Untitled'}</span>
              {s.unit && <span className="text-gray-400">· {s.unit}</span>}
            </span>
            <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString()}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
