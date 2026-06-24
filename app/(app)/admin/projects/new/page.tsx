import { requireAdmin } from '@/lib/dal'
import NewProjectForm from './new-project-form'

export const dynamic = 'force-dynamic'

export default async function NewProjectPage() {
  await requireAdmin()

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">New Project</h1>
      <p className="mb-6 text-sm text-gray-500">
        Create a project and set its delivery deadline. It starts at the Confirmation step
        and moves through the workflow as each role completes their part.
      </p>

      <NewProjectForm />
    </div>
  )
}
