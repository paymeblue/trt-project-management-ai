// Route-level skeleton shown while /admin/payment-confirmation resolves its server data.
export default function PaymentConfirmationLoading() {
  return (
    <div className="mx-auto max-w-xl animate-pulse px-6 py-8">
      <div className="h-4 w-20 rounded bg-surface-container" />
      <div className="mb-4 mt-2 h-7 w-72 rounded-md bg-surface-container-high" />
      <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="mb-3 h-4 w-1/2 rounded bg-surface-container-high" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-3 w-3/4 rounded bg-surface-container" />
          <div className="h-3 w-3/4 rounded bg-surface-container" />
          <div className="h-3 w-2/3 rounded bg-surface-container" />
          <div className="h-3 w-2/3 rounded bg-surface-container" />
        </div>
      </div>
      <div className="h-9 w-40 rounded-md bg-surface-container-high" />
    </div>
  )
}
