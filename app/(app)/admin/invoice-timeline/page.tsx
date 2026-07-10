import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { projects, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'
import { Positions, isAdminRole, roleDashboard, type UserRole } from '@/lib/workflow'
import InvoiceTimelineForm from './invoice-timeline-form'

export const dynamic = 'force-dynamic'

// v2.0 Phase 22: Head of Operations sets the delivery timeline once the
// invoice has been uploaded — mirrors /admin/payment-confirmation's page,
// but position-gated (not just role-gated) and scoped to steps after the
// Invoice Timeline step instead of after Payment Confirmation.
export default async function InvoiceTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { userId, role } = await verifySession()
  if (!isAdminRole(role as UserRole)) {
    redirect(roleDashboard(role))
  }
  const [actingUser] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
  if (actingUser?.position !== Positions.HeadOfOperations) {
    redirect(roleDashboard(role))
  }

  const { projectId } = await searchParams
  if (!projectId) {
    redirect(roleDashboard(role))
  }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) {
    redirect(roleDashboard(role))
  }

  const steps = await getLiveWorkflowSteps()
  const invoiceTimelineStep = steps.find((s) => s.key === 'invoice_timeline')
  if (!invoiceTimelineStep || proj.currentStep !== invoiceTimelineStep.n) {
    redirect(roleDashboard(role))
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <a href="/admin/timeline" className="text-sm text-primary hover:underline">
        ← Timeline
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Set Delivery Timeline</h1>
      <p className="mb-4 text-sm text-gray-500">
        The invoice has been uploaded. Set the overall delivery date and a deadline for every
        remaining step.
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
          {proj.location && (
            <div>
              <dt className="text-gray-400">Location</dt>
              <dd>{proj.location}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
          Payment status: {proj.paymentStatus}
        </p>
      </div>

      <InvoiceTimelineForm projectId={proj.id} />
    </div>
  )
}
