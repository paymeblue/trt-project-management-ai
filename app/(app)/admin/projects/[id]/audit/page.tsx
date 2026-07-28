import Link from 'next/link'
import { requireRole } from '@/lib/dal'
import {
  getProjectAudit,
  type AuditRow,
  type AuditChecklistSubmission,
  type AuditReadinessSubmission,
} from '@/lib/project-audit'
import { isImageAsset, type AuditAsset } from '@/lib/audit-assets'
import AuditAssetGallery from '@/app/_components/audit-asset-gallery'

export const dynamic = 'force-dynamic'

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString() : '—'
}

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString() : '—'
}

function ChecklistSubmissionDetails({
  submission,
  stepContext,
}: {
  submission: AuditChecklistSubmission
  stepContext: string
}) {
  const photoAssets: AuditAsset[] = submission.photos.map((src, i) => ({
    dataUrl: src,
    label: `Checklist photo ${i + 1}`,
    context: `${stepContext} · ${submission.definitionTitle}`,
    downloadName: `checklist-photo-${i + 1}`,
  }))
  return (
    <details className="rounded-md border border-gray-200 bg-white p-2">
      <summary className="cursor-pointer text-xs font-medium text-primary">
        {submission.definitionTitle} — {submission.submittedBy ?? 'Unknown'} ·{' '}
        {fmt(submission.submittedAt)}
      </summary>
      <div className="mt-2 space-y-1">
        {submission.items.map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-4 border-b border-gray-100 py-1 last:border-0">
            <p className="text-xs text-gray-700">{item.label}</p>
            <span className="shrink-0 text-xs font-semibold text-gray-900">{item.value}</span>
            {item.notes && <p className="text-[11px] text-gray-400">Note: {item.notes}</p>}
          </div>
        ))}
        {photoAssets.length > 0 && (
          <div className="mt-2">
            <AuditAssetGallery assets={photoAssets} thumbClassName="h-24 w-24" />
          </div>
        )}
      </div>
    </details>
  )
}

function ReadinessSubmissionDetails({
  submission,
  stepContext,
}: {
  submission: AuditReadinessSubmission
  stepContext: string
}) {
  // quick task 260728-lbx: one gate governs the whole page — isImageAsset
  // (lib/audit-assets.ts) replaces the local startsWith check that used to
  // live here.
  const legacyUploadIsImage = isImageAsset(submission.uploadData)
  const photoAssets: AuditAsset[] = submission.photos.map((src, i) => ({
    dataUrl: src,
    label: `Readiness photo ${i + 1}`,
    context: stepContext,
  }))
  return (
    <details className="rounded-md border border-gray-200 bg-white p-2">
      <summary className="cursor-pointer text-xs font-medium text-primary">
        Readiness ({submission.mode}) — {submission.submittedBy ?? 'Unknown'} · {fmt(submission.submittedAt)}
      </summary>
      <div className="mt-2 space-y-1">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-1">
          <p className="text-xs text-gray-700">Confirmed by</p>
          <span className="shrink-0 text-xs font-semibold text-gray-900">{submission.confirmedBy ?? '—'}</span>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-1">
          <p className="text-xs text-gray-700">Signed date</p>
          <span className="shrink-0 text-xs font-semibold text-gray-900">{submission.signedDate ?? '—'}</span>
        </div>
        {submission.signatureData && (
          <div className="mt-2">
            <p className="text-xs text-gray-700">Signature</p>
            <AuditAssetGallery
              assets={[
                {
                  dataUrl: submission.signatureData,
                  label: 'Signature',
                  context: stepContext,
                  downloadName: 'signature',
                },
              ]}
              thumbClassName="h-20 w-40"
            />
          </div>
        )}
        {submission.uploadData && (
          <div className="mt-2">
            <p className="text-xs text-gray-700">Legacy upload</p>
            {legacyUploadIsImage ? (
              <AuditAssetGallery
                assets={[
                  {
                    dataUrl: submission.uploadData,
                    label: submission.uploadName ?? 'Legacy upload',
                    context: stepContext,
                    downloadName: submission.uploadName ?? 'upload',
                  },
                ]}
                thumbClassName="h-24 w-24"
              />
            ) : (
              // Non-image uploads: filename text only — never a clickable
              // data: link (T-bpp-03: a data:text/html upload opened in a new
              // tab would execute as the app origin's document).
              <span className="text-xs text-gray-600">{submission.uploadName ?? 'File uploaded'}</span>
            )}
          </div>
        )}
        {photoAssets.length > 0 && (
          <div className="mt-2">
            <AuditAssetGallery assets={photoAssets} thumbClassName="h-24 w-24" />
          </div>
        )}
      </div>
    </details>
  )
}

function UploadCell({ upload, stepContext }: { upload: AuditRow['upload']; stepContext: string }) {
  if (!upload) return <span className="text-gray-400">—</span>
  if (upload.isImage) {
    // quick task 260728-lbx: the thumbnail now OPENS a lightbox (an <img> in
    // this document, which cannot execute script regardless of payload) —
    // the download link moved INSIDE the lightbox overlay. Top-frame
    // navigation to a data: URL is still never performed (T-bpp-03 intact):
    // this component never renders an <a href={dataUrl}> at all.
    return (
      <AuditAssetGallery
        assets={[
          {
            dataUrl: upload.dataUrl,
            label: upload.name ?? 'Uploaded file',
            context: stepContext,
            downloadName: upload.name ?? 'upload',
          },
        ]}
        thumbClassName="h-20 w-20"
      />
    )
  }
  // PDFs (invoices, sign-off documents) are viewable via download. Strictly
  // prefix-gated so this can never linkify an arbitrary data: payload
  // (T-bpp-03: a data:text/html upload must never become clickable).
  if (upload.dataUrl.startsWith('data:application/pdf')) {
    return (
      <a
        href={upload.dataUrl}
        download={upload.name ?? 'document.pdf'}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
        {upload.name ?? 'View PDF'}
      </a>
    )
  }
  // Anything else stays filename-only (T-bpp-03).
  return <span className="text-gray-600">{upload.name ?? 'File uploaded'}</span>
}

function AuditTableRow({ row }: { row: AuditRow }) {
  const notStarted = row.status === 'not_started'
  const stepContext = `Step ${row.n} — ${row.label}`
  return (
    <>
      <tr className={`align-top ${notStarted ? 'text-gray-400' : ''}`}>
        <td className="px-4 py-3">
          <p className={`font-medium ${notStarted ? 'text-gray-400' : 'text-gray-900'}`}>
            {row.n}. {row.label}
          </p>
          {notStarted && <p className="text-xs text-gray-400">Not started</p>}
        </td>
        <td className="px-4 py-3">
          {row.officerName ? (
            <>
              <p className="text-gray-800">{row.officerName}</p>
              <p className="text-xs text-gray-400">{row.officerPosition}</p>
            </>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-600">{fmt(row.completedAt)}</td>
        <td className="px-4 py-3 text-gray-600">{row.answer ?? <span className="text-gray-400">—</span>}</td>
        <td className="px-4 py-3">
          <UploadCell upload={row.upload} stepContext={stepContext} />
        </td>
        <td className="px-4 py-3 text-gray-600">
          {row.sentByName || row.receivedByName ? (
            <>
              <p>Sent: {row.sentByName ?? '—'}</p>
              <p>Received: {row.receivedByName ?? '—'}</p>
            </>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-600">
          {row.assignedUserName ?? <span className="text-gray-400">—</span>}
        </td>
      </tr>
      {row.checklistSubmissions.length > 0 && (
        <tr>
          <td colSpan={7} className="space-y-2 bg-gray-50 px-4 py-3">
            {row.checklistSubmissions.map((submission, i) => (
              <ChecklistSubmissionDetails key={i} submission={submission} stepContext={stepContext} />
            ))}
          </td>
        </tr>
      )}
      {row.readinessSubmissions.length > 0 && (
        <tr>
          <td colSpan={7} className="space-y-2 bg-gray-50 px-4 py-3">
            {row.readinessSubmissions.map((submission, i) => (
              <ReadinessSubmissionDetails key={i} submission={submission} stepContext={stepContext} />
            ))}
          </td>
        </tr>
      )}
    </>
  )
}

export default async function ProjectAuditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireRole('super_admin')

  const data = await getProjectAudit(id)

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/admin/timeline" className="text-sm text-primary hover:underline">
          ← Timeline
        </Link>
        <p className="mt-6 text-gray-500">Project not found.</p>
      </div>
    )
  }

  const { project, rows } = data

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/admin/timeline" className="text-sm text-primary hover:underline">
        ← Timeline
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">{project.name} — Audit</h1>
      <p className="mb-6 text-sm text-gray-500">
        Full read-only oversight across every live workflow step for this project.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Customer</p>
          <p className="text-sm text-gray-900">{project.customerName ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Location</p>
          <p className="text-sm text-gray-900">{project.location ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Current Step</p>
          <p className="text-sm text-gray-900">{project.currentStep}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Payment Status</p>
          <p className="text-sm text-gray-900">{project.paymentStatus}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Delivery Date</p>
          <p className="text-sm text-gray-900">{fmtDate(project.deliveryDate)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Step</th>
              <th className="px-4 py-3">Officer</th>
              <th className="px-4 py-3">Completed At</th>
              <th className="px-4 py-3">Answer</th>
              <th className="px-4 py-3">Upload</th>
              <th className="px-4 py-3">Approval</th>
              <th className="px-4 py-3">Assignment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <AuditTableRow key={row.key} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
