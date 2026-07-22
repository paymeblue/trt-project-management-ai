import type { ReactNode } from 'react';
import { eq } from 'drizzle-orm';
import { verifySession } from '@/lib/dal';
import { db } from '@/db';
import { users } from '@/db/schema';
import SidebarNav from '@/app/_components/sidebar-nav';
import SignOutButton from '@/app/_components/sign-out-button';
import TabSignOutButton from '@/app/_components/tab-sign-out-button';
import PaulArredo from '@/app/_components/paul-arredo';
import ThemeToggle from '@/app/_components/theme-toggle';
import MobileSidebar from '@/app/_components/mobile-sidebar';
import ChatDrawer from '@/app/_components/chat-drawer';
import PendingStepGate from '@/app/_components/pending-step-gate';
import HeaderProjectSwitcher from '@/app/_components/header-project-switcher';
import NotificationsBell from '@/app/_components/notifications-bell';
import { getDisputeUnreadCount } from '@/lib/notifications';
import MyWorkProvider from '@/app/_components/my-work-provider';
import WorkflowStepsProvider from '@/app/_components/workflow-steps-provider';
import { TrtLogo, TrtWatermark } from '@/app/_components/trt-logo';
import { getMyWork } from '@/lib/my-work';
import { getLiveWorkflowSteps } from '@/lib/workflow-graph';
import { isAdminRole, userRoleLabel, type UserRole } from '@/lib/workflow';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Header-first, cookie-fallback (Phase 20.1): a tab running a per-tab
  // session must see ITS OWN identity in the sidebar/header chrome, not the
  // shared cookie's. auth() only ever reads the shared cookie — verifySession()
  // is the DAL choke point that also honors a per-tab Authorization header,
  // and every Server Component in this tree must go through it (PATTERNS.md).
  const { userId, role } = await verifySession();

  const [me] = await db
    .select({ name: users.name, avatarData: users.avatarData, position: users.position })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const name = me?.name ?? 'User';
  const initials =
    name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';
  const avatarData = me?.avatarData ?? null;

  // Admin roles (super_admin / operations) display their job position instead
  // of a generic role label, e.g. "Head of Projects".
  const isAdmin = isAdminRole(role as UserRole);
  const roleLabel =
    (isAdmin && me?.position?.trim()) || userRoleLabel(role);

  // Header switcher + forcing gate get a server-rendered snapshot; the provider
  // then polls /api/my-work to keep them near-real-time.
  const initialWork = await getMyWork(role as UserRole, userId);
  const disputeUnread = await getDisputeUnreadCount(userId);
  // Live workflow steps (Phase 17, WF-06): seeded once per request from the DB
  // graph, exposed to client components via useWorkflowSteps().
  const liveSteps = await getLiveWorkflowSteps();

  return (
    <MyWorkProvider initial={initialWork}>
    <WorkflowStepsProvider initial={liveSteps}>
    <div className="relative min-h-screen bg-background text-on-surface">
      {/* TRT logo watermark behind every screen */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0 flex justify-center overflow-hidden pb-10"
      >
        <TrtWatermark className="w-[46vmin] opacity-[0.07]" />
      </div>

      {/* NavigationDrawer (fixed, out of flow) */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 hidden w-72 flex-col overflow-y-auto border-r border-outline-variant bg-surface-container-low md:flex">
        {/* Brand — same height as the top header bar so the divider runs straight */}
        <div className="flex h-16 shrink-0 items-center border-b border-outline-variant px-6 md:h-20">
          <TrtLogo />
        </div>
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

        <SidebarNav role={role} disputeUnread={disputeUnread} />

        <div className="border-t border-outline-variant p-4 flex flex-wrap gap-2">
          <SignOutButton />
          <TabSignOutButton />
        </div>
      </aside>

      {/* Main canvas — block with left padding for the fixed sidebar (can't collapse) */}
      <div className="relative z-10 flex min-h-screen w-full flex-col md:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant bg-surface/95 px-margin-mobile backdrop-blur-sm md:h-20 md:px-margin-desktop">
          <div className="flex items-center gap-2">
            <MobileSidebar
              name={name}
              role={role}
              roleLabel={roleLabel}
              initials={initials}
              avatarData={avatarData}
            />
            <HeaderProjectSwitcher
              viewerRole={role as UserRole}
              viewerUserId={userId}
              viewerPosition={me?.position ?? null}
            />
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
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
      <PendingStepGate viewerRole={role as UserRole} />
    </div>
    </WorkflowStepsProvider>
    </MyWorkProvider>
  );
}
