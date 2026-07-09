'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  createProjectAction,
  type CreateProjectState,
} from '@/actions/projects';
import {
  WORKFLOW_STEPS,
  FIRST_ACTION_STEP,
  LAST_STEP,
  workflowRoleLabel,
} from '@/lib/workflow';

const INITIAL: CreateProjectState = { status: 'idle' };

// Steps Operations can set a deadline for (step 1 auto-completes at creation).
const ACTIONABLE_STEPS = WORKFLOW_STEPS.filter((s) => s.n >= FIRST_ACTION_STEP);

export default function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, INITIAL);
  // Per-step deadline values (ISO date strings) + a toast for ordering errors.
  const [deadlines, setDeadlines] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // A step's deadline must sit on/after every earlier step and on/before every
  // later step (ISO date strings compare correctly lexicographically).
  function bounds(stepN: number): { min?: string; max?: string } {
    let min: string | undefined;
    let max: string | undefined;
    for (const s of ACTIONABLE_STEPS) {
      const v = deadlines[s.n];
      if (!v) continue;
      if (s.n < stepN) min = !min || v > min ? v : min;
      if (s.n > stepN && (!max || v < max)) max = v;
    }
    return { min, max };
  }

  function labelOf(n: number) {
    const s = ACTIONABLE_STEPS.find((x) => x.n === n);
    return s ? `${s.n}. ${s.label}` : `step ${n}`;
  }

  function onChange(stepN: number, value: string) {
    if (value) {
      const { min, max } = bounds(stepN);
      if (min && value < min) {
        const earlier = ACTIONABLE_STEPS.filter(
          (s) => s.n < stepN && deadlines[s.n] === min,
        )[0];
        setToast(
          `“${labelOf(stepN)}” can’t be due before “${labelOf(earlier?.n ?? stepN)}”. Later steps must come on or after earlier ones.`,
        );
        return; // reject the out-of-order value
      }
      if (max && value > max) {
        const later = ACTIONABLE_STEPS.filter(
          (s) => s.n > stepN && deadlines[s.n] === max,
        )[0];
        setToast(
          `“${labelOf(stepN)}” can’t be due after “${labelOf(later?.n ?? stepN)}”. Earlier steps must come on or before later ones.`,
        );
        return;
      }
    }
    setDeadlines((prev) => {
      const next = { ...prev };
      if (value) next[stepN] = value;
      else delete next[stepN];
      return next;
    });
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none';
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600';

  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div>
        <label className={labelCls}>Project name</label>
        <input
          name="name"
          required
          minLength={2}
          placeholder="e.g. John Doe"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Location</label>
        <input
          name="location"
          placeholder="e.g. 6. Gold street, Victoria Island, Lagos"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Final delivery deadline</label>
        <input name="deliveryDate" type="date" required className={inputCls} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-700">
          Per-step deadlines
        </p>
        <p className="mb-3 text-[11px] text-gray-500">
          Optional — set a target date for each step so each role is accountable
          to its own deadline (steps {FIRST_ACTION_STEP}–{LAST_STEP}). A later
          step can’t be due before an earlier one.
        </p>
        <div className="space-y-2">
          {ACTIONABLE_STEPS.map((s) => {
            const { min, max } = bounds(s.n);
            return (
              <div key={s.n} className="flex items-center gap-3">
                <label
                  htmlFor={`deadline_${s.n}`}
                  className="min-w-0 flex-1 text-xs text-gray-600"
                >
                  <span className="font-medium text-gray-800">
                    {s.n}. {s.label}
                  </span>
                  <span className="text-gray-400">
                    {' '}
                    · {workflowRoleLabel(s.role)}
                  </span>
                </label>
                <input
                  id={`deadline_${s.n}`}
                  name={`deadline_${s.n}`}
                  type="date"
                  value={deadlines[s.n] ?? ''}
                  min={min}
                  max={max}
                  onChange={(e) => onChange(s.n, e.target.value)}
                  className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      </div>

      {state.status === 'error' && (
        <p className="text-sm text-error">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {pending ? 'Creating…' : 'Create project'}
      </button>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] max-w-sm rounded-lg border border-red-200 bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </form>
  );
}
