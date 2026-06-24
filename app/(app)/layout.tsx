import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/db';
import { users, projects } from '@/db/schema';
import SidebarNav from '@/app/_components/sidebar-nav';
import SignOutButton from '@/app/_components/sign-out-button';
import PaulArredo from '@/app/_components/paul-arredo';
import ThemeToggle from '@/app/_components/theme-toggle';
import MobileSidebar from '@/app/_components/mobile-sidebar';
import ChatDrawer from '@/app/_components/chat-drawer';
import PendingStepGate, { type PendingItem } from '@/app/_components/pending-step-gate';
import HeaderProjectSwitcher from '@/app/_components/header-project-switcher';
import {
  isAdminRole,
  stepByN,
  canRoleActOnStep,
  isProjectComplete,
  type UserRole,
} from '@/lib/workflow';

const ROLE_LABELS: Record<string, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  super_admin: 'Super Admin',
  operations: 'Operations',
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');

  const name = session.user.name ?? 'User';
  const role = (session.user.role as string) ?? 'factory_pm';
  const initials =
    name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';

  const [me] = session.user.id
    ? await db
        .select({ avatarData: users.avatarData, position: users.position })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
    : [];
  const avatarData = me?.avatarData ?? null;

  // Admin roles (super_admin / operations) display their job position instead
  // of a generic role label, e.g. "Head of Projects".
  const isAdmin = isAdminRole(role as UserRole);
  const roleLabel =
    (isAdmin && me?.position?.trim()) || ROLE_LABELS[role] || role;

  // Active (in-progress) projects power the header switcher; the subset awaiting
  // THIS user's action powers the forcing "action required" gate.
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      currentStep: projects.currentStep,
      deliveryDate: projects.deliveryDate,
    })
    .from(projects);

  const active = projectRows.filter((p) => !isProjectComplete(p.currentStep));
  const activeProjects = active.map((p) => ({
    id: p.id,
    name: p.name,
    stepN: p.currentStep,
    deadline: p.deliveryDate ? p.deliveryDate.toISOString() : null,
  }));

  const pending: PendingItem[] = active
    .filter((p) => {
      const step = stepByN(p.currentStep);
      return step ? canRoleActOnStep(step.role, role as UserRole) : false;
    })
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      stepN: p.currentStep,
      deadline: p.deliveryDate ? p.deliveryDate.toISOString() : null,
    }))
    .sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* NavigationDrawer (fixed, out of flow) */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 hidden w-72 flex-col overflow-y-auto border-r border-outline-variant bg-surface-container-low md:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-outline-variant px-6 md:h-20">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-container text-title-md font-title-md font-bold text-on-primary-container">
            {avatarData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarData}
                alt={name}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-title-md font-title-md font-bold leading-tight text-primary">
              {name}
            </p>
            <p className="truncate text-body-md font-body-md leading-tight text-on-surface-variant">
              {roleLabel}
            </p>
            <p className="truncate text-label-sm font-label-sm uppercase tracking-wider text-on-surface-variant">
              Arredo Manufacturing
            </p>
          </div>
        </div>

        <SidebarNav role={role} />

        <div className="border-t border-outline-variant p-4">
          <SignOutButton />
        </div>
      </aside>

      {/* Main canvas — block with left padding for the fixed sidebar (can't collapse) */}
      <div className="flex min-h-screen w-full flex-col md:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant bg-surface/95 px-margin-mobile backdrop-blur-sm md:h-20 md:px-margin-desktop">
          <div className="flex items-center gap-2">
            <MobileSidebar
              name={name}
              role={role}
              roleLabel={roleLabel}
              initials={initials}
              avatarData={avatarData}
            />
            <span className="material-symbols-outlined text-primary">
              architecture
            </span>
            <h1 className="text-headline-md font-headline-md font-extrabold text-primary">
              TRT Arredo
            </h1>
            <HeaderProjectSwitcher projects={activeProjects} viewerRole={role as UserRole} />
          </div>
          <div className="flex items-center gap-2">
            <ChatDrawer />
            <ThemeToggle />
            <span className="hidden rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 text-label-md font-label-md text-on-surface-variant sm:inline">
              {roleLabel}
            </span>
          </div>
        </header>

        <main className="w-full flex-1 px-margin-mobile py-6 md:px-margin-desktop">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Paul Arredo floating assistant */}
      <PaulArredo />

      {/* Forcing "action required" modal for steps on this user's desk */}
      <PendingStepGate pending={pending} />
    </div>
  );
}
