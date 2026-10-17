import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CreditCard, FileText, Info, Receipt } from 'lucide-react'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ErrorState, LoadingState } from '../../components/ui/primitives'
import { api, fieldErrors } from '../../lib/api'
import { SUPPORT_URL } from '../../lib/plans'
import { toast } from '../../lib/toast'

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—')
const PLAN_NAMES: Record<string, string> = { free: 'Free demo', plus: 'Plus', business: 'Business' }

/** Billing & payments, for the founding admin only (the server refuses everyone else). */
export default function Billing() {
  const qc = useQueryClient()
  const billing = useQuery({ queryKey: ['billing'], queryFn: api.billing })
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const b = billing.data

  useEffect(() => {
    if (!b) return
    setCompany(b.company)
    setEmail(b.billing_email)
  }, [b?.company, b?.billing_email]) // eslint-disable-line react-hooks/exhaustive-deps

  if (billing.isLoading) return <LoadingState />
  if (billing.isError) return <ErrorState error={billing.error} onRetry={() => billing.refetch()} className="m-6" />

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      qc.setQueryData(['billing'], await api.updateBilling(company.trim(), email.trim()))
      qc.invalidateQueries({ queryKey: ['account'] })
      toast.success('Billing details saved')
    } catch (err) {
      const f = fieldErrors(err)
      if (f) setErrors(f)
      else toast.error('Could not save', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-4 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Billing & payments</h1>
      <p className="text-[16px] text-fg-muted">Only you, as the workspace owner, can see this page and change the plan.</p>

      <div className="flex gap-3 rounded-2xl bg-[#FBF1DC] p-4 text-[14px] leading-relaxed text-warning">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-semibold">Online payment isn’t connected in this preview.</span> Plans are switched with a demo checkout and nothing is charged. Integrint contacts you before any real billing starts.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Subscription">
        <div className="rounded-3xl bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <Receipt className="size-4" /> Plan
          </p>
          <p className="mt-2 text-[22px] font-semibold">{b!.plan.name}</p>
          <p className="text-[14px] text-fg-muted">{b!.monthly_eur ? `€${b!.monthly_eur} / month` : 'Free'}</p>
        </div>
        <div className="rounded-3xl bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <CalendarClock className="size-4" /> {b!.status === 'active' ? 'Next renewal' : 'Status'}
          </p>
          <p className="mt-2 text-[22px] font-semibold">{b!.status === 'active' ? date(b!.renews_at) : 'No subscription'}</p>
          <p className="text-[14px] text-fg-muted">{b!.started_at ? `Since ${date(b!.started_at)}` : 'Upgrade any time'}</p>
        </div>
        <div className="rounded-3xl bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <CreditCard className="size-4" /> Payment method
          </p>
          <p className="mt-2 text-[22px] font-semibold">None</p>
          <p className="text-[14px] text-fg-muted">Not needed in the preview</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {b!.status === 'active' ? (
          <ButtonLink to="/studio/upgrade?plan=business">Change plan</ButtonLink>
        ) : (
          <ButtonLink to="/studio/upgrade?plan=plus" variant="primary">
            Upgrade to Plus
          </ButtonLink>
        )}
        <Link to="/studio/settings" className="inline-flex h-10 items-center px-3 text-[15px] text-accent">
          Plan usage in Account
        </Link>
      </div>

      <form onSubmit={save} noValidate className="rounded-3xl border border-line-soft bg-white p-6">
        <h2 className="flex items-center gap-2 text-[19px] font-semibold">
          <FileText className="size-5 text-accent" /> Billing details
        </h2>
        <p className="mt-1 text-[14px] text-fg-muted">Printed on invoices once billing is live.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[15px] font-medium">Company name</span>
            <input className="field-input" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" aria-invalid={!!errors.company || undefined} />
            {errors.company && <span className="mt-1 block text-[13px] text-error">{errors.company}</span>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[15px] font-medium">Billing email</span>
            <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.billing_email || undefined} />
            {errors.billing_email && <span className="mt-1 block text-[13px] text-error">{errors.billing_email}</span>}
          </label>
        </div>
        <Button type="submit" variant="primary" className="mt-5" loading={busy} disabled={!company.trim() || !email.trim()}>
          Save details
        </Button>
      </form>

      <section className="rounded-3xl bg-ink-900 p-6" aria-labelledby="history-title">
        <h2 id="history-title" className="text-[19px] font-semibold">
          Billing history
        </h2>
        {b!.history.length === 0 ? (
          <p className="mt-2 text-[15px] text-fg-muted">No plan changes yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-line-soft text-[12px] uppercase tracking-[0.06em] text-fg-subtle">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Event</th>
                  <th className="py-2 font-medium">Amount</th>
                  <th className="py-2 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {b!.history.map((h) => (
                  <tr key={h.id} className="border-b border-line-soft last:border-0">
                    <td className="py-3">{date(h.at)}</td>
                    <td className="py-3">
                      {h.kind === 'checkout' ? `Upgrade to ${PLAN_NAMES[h.plan] ?? h.plan}` : `Switched to ${PLAN_NAMES[h.plan] ?? h.plan}`}
                      <span className="block text-[12.5px] text-fg-subtle">{h.by}</span>
                    </td>
                    <td className="py-3 tabular-nums">€{h.amount_eur.toFixed(2)}</td>
                    <td className="py-3">
                      <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-fg-muted">{h.charged ? 'Paid' : 'Not charged (demo)'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-[14px] text-fg-muted">
        Questions about billing?{' '}
        <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="text-accent">
          Contact Integrint
        </a>
      </p>
    </div>
  )
}
