// Route-level skeleton shown while /workflow/step resolves its server data.
export default function WorkflowStepLoading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 py-8 sm:px-6">
      <div className="h-4 w-24 rounded bg-surface-container" />
      <div className="mb-6 mt-2 h-7 w-56 rounded-md bg-surface-container-high" />
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5">
        <div className="mb-4 h-4 w-3/4 rounded bg-surface-container-high" />
        <div className="mb-2 h-3 w-full rounded bg-surface-container" />
        <div className="mb-6 h-3 w-2/3 rounded bg-surface-container" />
        <div className="flex gap-3">
          <div className="h-9 w-24 rounded-md bg-surface-container-high" />
          <div className="h-9 w-24 rounded-md bg-surface-container" />
        </div>
      </div>
    </div>
  )
}
