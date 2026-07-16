import { verifySession, isAdminRole } from '@/lib/dal';
import { Roles, type UserRole } from '@/lib/workflow';
import ProjectIntakeForm from '@/app/_components/project-intake-form';

export const dynamic = 'force-dynamic';

export default async function ProjectIntakePage() {
  const { role } = await verifySession();
  if (role !== Roles.CustomerCare && !isAdminRole(role as UserRole)) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">New Project</h1>
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Only Customer Care can create a project intent.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <a
        href="/customer-care/dashboard"
        className="text-sm text-primary hover:underline"
      >
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">
        New Project
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Capture the client&apos;s intent from the intake call. The project
        starts unpaid — Head of Operations confirms payment and sets the
        timeline next.
      </p>

      <ProjectIntakeForm />
    </div>
  );
}
