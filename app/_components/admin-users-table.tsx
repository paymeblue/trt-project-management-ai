'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateUserRoleAction, deleteUserAction, resetUserPasswordAction } from '@/actions/admin-users'
import { ALL_USER_ROLES } from '@/lib/workflow'

type Row = { id: string; name: string; email: string; role: string }

const ADMIN_ROLES = ['super_admin', 'operations']

export default function AdminUsersTable({ users, meId }: { users: Row[]; meId: string }) {
  const router = useRouter()
  const [roles, setRoles] = useState<Record<string, string>>(
    Object.fromEntries(users.map((u) => [u.id, u.role])),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null)
  const [confirmReset, setConfirmReset] = useState<Row | null>(null)
  const [resetResult, setResetResult] = useState<{ name: string; tempPassword?: string; emailed?: boolean } | null>(null)
  const [warning, setWarning] = useState('')

  const isProtected = (u: Row) => ADMIN_ROLES.includes(u.role) && u.id !== meId

  async function update(u: Row) {
    if (isProtected(u)) {
      setWarning('You cannot modify another Super Admin.')
      return
    }
    setBusy(u.id)
    const res = await updateUserRoleAction(u.id, roles[u.id])
    setBusy(null)
    if (!res.ok) setWarning(res.error ?? 'Update failed.')
    else router.refresh()
  }

  async function doDelete(u: Row) {
    setBusy(u.id)
    const res = await deleteUserAction(u.id)
    setBusy(null)
    setConfirmDelete(null)
    if (!res.ok) setWarning(res.error ?? 'Delete failed.')
    else router.refresh()
  }

  function tryDelete(u: Row) {
    if (isProtected(u)) {
      setWarning('You cannot delete another Super Admin.')
      return
    }
    if (u.id === meId) {
      setWarning('You cannot delete your own account.')
      return
    }
    setConfirmDelete(u)
  }

  function tryReset(u: Row) {
    if (isProtected(u)) {
      setWarning('You cannot reset another Super Admin\'s password.')
      return
    }
    setConfirmReset(u)
  }

  async function doReset(u: Row) {
    setBusy(u.id)
    const res = await resetUserPasswordAction(u.id)
    setBusy(null)
    setConfirmReset(null)
    if (!res.ok) {
      setWarning(res.error ?? 'Reset failed.')
      return
    }
    setResetResult({ name: u.name, tempPassword: res.tempPassword, emailed: res.emailed })
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const locked = isProtected(u)
              return (
                <tr key={u.id} className={locked ? 'bg-amber-50/40' : undefined}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.name}
                    {u.id === meId && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={roles[u.id]}
                      disabled={locked}
                      onChange={(e) => setRoles((r) => ({ ...r, [u.id]: e.target.value }))}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
                    >
                      {ALL_USER_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => update(u)}
                        disabled={busy === u.id || locked}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        onClick={() => tryReset(u)}
                        disabled={busy === u.id || locked}
                        title="Reset password"
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px] align-middle">key</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => tryDelete(u)}
                        disabled={busy === u.id}
                        title={locked ? 'Protected Super Admin' : 'Delete user'}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px] align-middle">
                          {locked ? 'lock' : 'delete'}
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Delete user?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently remove <span className="font-semibold">{confirmDelete.name}</span> (
              {confirmDelete.email}). This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doDelete(confirmDelete)}
                disabled={busy === confirmDelete.id}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password confirmation modal */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Reset password?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This sets a new temporary password for{' '}
              <span className="font-semibold">{confirmReset.name}</span> ({confirmReset.email}).
              Their old password stops working immediately.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doReset(confirmReset)}
                disabled={busy === confirmReset.id}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {busy === confirmReset.id ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password result modal */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Password reset</h3>
            <p className="mt-2 text-sm text-gray-600">
              {resetResult.emailed
                ? `${resetResult.name}'s new credentials were emailed to them.`
                : `Email could not be sent — share this new password with ${resetResult.name} securely:`}
            </p>
            {!resetResult.emailed && resetResult.tempPassword && (
              <p className="mt-2 rounded-md bg-gray-100 p-2 font-mono text-xs text-gray-800">
                {resetResult.tempPassword}
              </p>
            )}
            <button
              type="button"
              onClick={() => setResetResult(null)}
              className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Warning modal */}
      {warning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <span className="material-symbols-outlined text-4xl text-amber-500">shield_person</span>
            <p className="mt-2 text-base font-semibold text-gray-900">Action not allowed</p>
            <p className="mt-1 text-sm text-gray-600">{warning}</p>
            <button
              type="button"
              onClick={() => setWarning('')}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
