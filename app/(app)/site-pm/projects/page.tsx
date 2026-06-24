import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import ProjectStepsBoard, { type BoardProject } from '@/app/_components/project-steps-board'

export const dynamic = 'force-dynamic'

export default async function SiteProjectsPage() {
  await verifySession()
  const rows = await db.select().from(projects).orderBy(desc(projects.createdAt))

  const board: BoardProject[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    location: p.location,
    deliveryDate: p.deliveryDate ? p.deliveryDate.toISOString() : null,
    currentStep: p.currentStep,
    status: p.status,
  }))

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/site-pm/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Projects</h1>
      <p className="mb-6 text-sm text-gray-500">
        Open a project to see its steps. The current step is enabled when it is your turn;
        later steps stay locked until earlier ones are completed.
      </p>

      <ProjectStepsBoard projects={board} viewerRole="site_pm" />
    </div>
  )
}
