import { asc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { projectDisputes, projects, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { postDisputeMessageAction } from '@/actions/disputes'
import TabTokenForm from '@/app/_components/tab-token-form'

export const dynamic = 'force-dynamic'

// Per-project dispute thread (REQ-G10) — visible to any authenticated user
// (participants + all super admins), since project boards are already shared.
export default async function DisputePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { userId } = await verifySession()
  const { projectId } = await params

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project) notFound()

  const messages = await db
    .select({
      id: projectDisputes.id,
      body: projectDisputes.body,
      createdAt: projectDisputes.createdAt,
      authorId: projectDisputes.authorId,
      authorName: users.name,
    })
    .from(projectDisputes)
    .leftJoin(users, eq(projectDisputes.authorId, users.id))
    .where(eq(projectDisputes.projectId, projectId))
    .orderBy(asc(projectDisputes.createdAt))

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <a href="/site-pm/issues" className="text-sm text-primary hover:underline">
        ← Issue Log
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Dispute · {project.name}</h1>
      <p className="mb-6 text-sm text-gray-500">
        Discussion thread for this project. Visible to the team and all super admins.
      </p>

      <div className="mb-4 space-y-3">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            No messages yet. Start the discussion below.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border p-3 shadow-sm ${
                m.authorId === userId ? 'border-primary/30 bg-primary/5' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-800">
                  {m.authorName ?? 'Unknown'}
                  {m.authorId === userId && <span className="text-gray-400"> · you</span>}
                </span>
                <span className="text-[11px] text-gray-400">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{m.body}</p>
            </div>
          ))
        )}
      </div>

      <TabTokenForm
        action={postDisputeMessageAction}
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Add to the discussion…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Post message
        </button>
      </TabTokenForm>
    </div>
  )
}
