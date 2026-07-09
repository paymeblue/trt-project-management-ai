import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'
import PaymentConfirmationForm from './payment-confirmation-form'

export const dynamic = 'force-dynamic'

export default async function PaymentConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  await requireAdmin()
  const { projectId } = await searchParams

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment Confirmation & Timeline</h1>
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Missing project. Open this from the project board or timeline.
        </p>
      </div>
    )
  }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment Confirmation & Timeline</h1>
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Project not found.
        </p>
      </div>
    )
  }

  if (proj.currentStep !== 2) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment Confirmation & Timeline</h1>
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          &quot;{proj.name}&quot; is not awaiting payment confirmation (it&apos;s already past this
          step, or hasn&apos;t reached it).
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <a href="/admin/timeline" className="text-sm text-primary hover:underline">
        ← Timeline
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Payment Confirmation & Timeline</h1>
      <p className="mb-4 text-sm text-gray-500">
        Confirm the client has paid, then set a deadline for every remaining step.
      </p>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">{proj.name}</p>
        <dl className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
          {proj.customerName && (
            <div>
              <dt className="text-gray-400">Customer</dt>
              <dd>{proj.customerName}</dd>
            </div>
          )}
          {proj.customerEmail && (
            <div>
              <dt className="text-gray-400">Email</dt>
              <dd>{proj.customerEmail}</dd>
            </div>
          )}
          {proj.customerPhone && (
            <div>
              <dt className="text-gray-400">Phone</dt>
              <dd>{proj.customerPhone}</dd>
            </div>
          )}
          {proj.location && (
            <div>
              <dt className="text-gray-400">Location</dt>
              <dd>{proj.location}</dd>
            </div>
          )}
          {proj.scope && (
            <div className="sm:col-span-2">
              <dt className="text-gray-400">Scope</dt>
              <dd className="whitespace-pre-wrap">{proj.scope}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
          Payment status: {proj.paymentStatus}
        </p>
      </div>

      <PaymentConfirmationForm projectId={proj.id} />
    </div>
  )
}
