import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { readinessForms } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import ReadinessForm from '@/app/_components/readiness-form'

export const dynamic = 'force-dynamic'

export default async function ReadinessPage() {
  const { userId } = await verifySession()

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
      <a href="/factory-pm/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Materials / Accessories Readiness Form</h1>
      <p className="mb-6 text-sm text-gray-500">
        Upload a photo of the signed paper form, or create a digital version and sign on screen.
      </p>

      <ReadinessForm />

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
