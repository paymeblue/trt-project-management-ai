import { requireRole } from '@/lib/dal'

export const dynamic = 'force-dynamic'

const LINKS = [
  { href: '/about', title: 'About TRT', description: 'Company info, policies and management team.' },
  { href: '/email-formats', title: 'Email Formats', description: 'Standard email templates for PMs.' },
  { href: '/processes', title: 'Processes & Flow Charts', description: 'Process knowledge base and flowcharts.' },
]

export default async function AdminContentPage() {
  await requireRole('super_admin')
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Content Management</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md"
          >
            <h3 className="mb-1 text-base font-semibold text-gray-900">{l.title}</h3>
            <p className="text-sm text-gray-500">{l.description}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
