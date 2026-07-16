'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserAction } from '@/actions/admin-users';
import { ALL_USER_ROLES } from '@/lib/workflow';

export default function AdminCreateUser() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('factory_pm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    tempPassword?: string;
    emailed?: boolean;
  } | null>(null);

  async function submit() {
    setError('');
    setResult(null);
    setBusy(true);
    const res = await createUserAction({ name, email, role });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not create the user.');
      return;
    }
    setResult({ tempPassword: res.tempPassword, emailed: res.emailed });
    setName('');
    setEmail('');
    router.refresh();
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none';
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">
        Create a new user
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Full name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputCls}
          >
            {ALL_USER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p className="font-semibold">User created.</p>
          <p className="mt-1">
            {result.emailed
              ? 'Their credentials were emailed to them.'
              : 'Email could not be sent — share these credentials securely:'}
          </p>
          {!result.emailed && result.tempPassword && (
            <p className="mt-1 font-mono text-xs">
              Temporary password: {result.tempPassword}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {busy ? 'Creating…' : 'Create user & send credentials'}
      </button>
    </div>
  );
}
