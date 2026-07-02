import { verifySession } from '@/lib/dal'
import { getBoardProjects } from '@/lib/projects-board'
import ProjectStepsBoard from '@/app/_components/project-steps-board'

export const dynamic = 'force-dynamic'

export default async function SiteProjectsPage() {
  await verifySession()
  const board = await getBoardProjects()

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
