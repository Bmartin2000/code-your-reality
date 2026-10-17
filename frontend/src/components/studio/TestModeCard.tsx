import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { api } from '../../lib/api'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/cn'

const OPTIONS = [
  { id: 'free', label: 'Free' },
  { id: 'plus', label: 'Plus' },
] as const

/** Founding Super Admin only: experience the app on Free or Plus without touching the real plan. */
export function TestModeCard() {
  const qc = useQueryClient()
  const state = useQuery({ queryKey: ['test-mode'], queryFn: api.testMode })
  const [busy, setBusy] = useState<string | null>(null)
  const current = state.data?.plan ?? null

  const choose = async (plan: 'free' | 'plus' | null) => {
    if (plan === current) return
    setBusy(plan ?? 'off')
    try {
      qc.setQueryData(['test-mode'], await api.setTestMode(plan))
      // Every plan-dependent view (limits, locked features, upgrade prompts) refetches right away.
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'test-mode' })
      toast.success(plan ? `Testing as ${plan === 'plus' ? 'Plus' : 'Free'}` : 'Test Mode is off', plan ? 'Only your account sees this plan. Nothing is charged.' : 'You see the real plan again.')
    } catch (e) {
      toast.error('Could not switch Test Mode', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const data = state.data
  return (
    <section className={cn('rounded-3xl border-2 p-6', current ? 'border-[#E8A33D] bg-[#FFF8EB]' : 'border-line-soft bg-ink-900')} aria-labelledby="test-mode-title">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-warning">
          <FlaskConical className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="test-mode-title" className="text-[19px] font-semibold">
            Subscription Test Mode
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-fg-muted">
            Founding admin only. Use the app exactly as a Free or Plus customer would: limits, locked features and upgrade prompts. Your real plan, billing and other users stay unchanged.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-[15px] font-medium">Testing as:</span>
        <div role="radiogroup" aria-label="Testing as" className="inline-flex rounded-full bg-white p-1 ring-1 ring-line-soft">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={current === o.id}
              disabled={!!busy || state.isLoading}
              onClick={() => choose(o.id)}
              className={cn('min-w-[84px] rounded-full px-4 py-2 text-[15px] font-semibold transition-colors', current === o.id ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg')}
            >
              {o.label}
            </button>
          ))}
        </div>
        {current && (
          <button className="text-[14px] font-medium text-accent disabled:opacity-50" disabled={!!busy} onClick={() => choose(null)}>
            Turn off
          </button>
        )}
      </div>

      {data && (
        <p className="mt-4 text-[14px] text-fg-muted" aria-live="polite">
          {current ? (
            <>
              <span className="font-semibold text-warning">Test Mode on · {data.effective.name}</span> · {data.usage.analyses_this_month} of {data.effective.analyses_per_month} video analyses used this month · real plan: <span className="capitalize">{data.real_plan}</span>
            </>
          ) : (
            <>
              Off · you see the real plan ({data.effective.name}, {data.effective.analyses_per_month} video analyses a month)
            </>
          )}
        </p>
      )}
    </section>
  )
}
