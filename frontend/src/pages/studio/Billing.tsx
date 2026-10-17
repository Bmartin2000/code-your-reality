import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, FileText, Gauge, Info, PlugZap, Receipt, Wallet } from 'lucide-react'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ErrorState, LoadingState } from '../../components/ui/primitives'
import { InvoiceDialog, InvoiceList, formatDate, formatMoney } from '../../components/invoicing/InvoiceParts'
import { api, fieldErrors } from '../../lib/api'
import type { BillingInfo, InvoiceInfo } from '../../lib/types'
import { SUPPORT_URL } from '../../lib/plans'
import { toast } from '../../lib/toast'

const PLAN_NAMES: Record<string, string> = { free: 'Free demo', plus: 'Plus', business: 'Business' }
const EMPTY = { company: '', billing_email: '', country: 'Magyarország', postcode: '', city: '', address: '', tax_number: '' }

/** Subscription, usage and invoices, for the workspace owner (the server refuses everyone else). */
export default function Billing() {
  const qc = useQueryClient()
  const billing = useQuery({ queryKey: ['billing'], queryFn: api.billing })
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [viewing, setViewing] = useState<InvoiceInfo | null>(null)
  const b = billing.data

  useEffect(() => {
    if (!b) return
    setForm({ company: b.company, billing_email: b.billing_email, ...b.address })
  }, [b?.company, b?.billing_email, b?.address.postcode, b?.address.city, b?.address.address, b?.address.tax_number]) // eslint-disable-line react-hooks/exhaustive-deps

  if (billing.isLoading) return <LoadingState />
  if (billing.isError) return <ErrorState error={billing.error} onRetry={() => billing.refetch()} className="m-6" />
  const data = b as BillingInfo

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('save')
    setErrors({})
    try {
      qc.setQueryData(['billing'], await api.updateBilling({ ...form, company: form.company.trim(), billing_email: form.billing_email.trim() }))
      qc.invalidateQueries({ queryKey: ['account'] })
      toast.success('Billing details saved', 'Drafts that aren’t issued yet use the new details.')
    } catch (err) {
      const f = fieldErrors(err)
      if (f) setErrors(f)
      else toast.error('Could not save', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const act = async (key: string, fn: () => Promise<InvoiceInfo>) => {
    setBusy(key)
    try {
      const inv = await fn()
      if (inv.status === 'failed') toast.error('The invoice was not issued', inv.error ?? undefined)
      else if (key.startsWith('issue')) toast.success(`Invoice ${inv.number} issued`, 'Számlázz.hu emails it to the billing address.')
      await billing.refetch()
    } catch (err) {
      toast.error('Something went wrong', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const input = (k: keyof typeof EMPTY, label: string, type = 'text', auto?: string) => (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-medium">{label}</span>
      <input className="field-input" type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} autoComplete={auto} aria-invalid={!!errors[k] || undefined} />
      {errors[k] && <span className="mt-1 block text-[13px] text-error">{errors[k]}</span>}
    </label>
  )
  const open = data.invoices.filter((i) => !i.paid_at)

  return (
    <div className="mx-auto max-w-[880px] space-y-4 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Subscription & invoices</h1>
      <p className="text-[16px] text-fg-muted">Only you, as the workspace owner, can see this page and change the plan.</p>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Subscription">
        <div className="rounded-3xl bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <Receipt className="size-4" /> Plan
          </p>
          <p className="mt-2 text-[22px] font-semibold">{data.plan.name}</p>
          <p className="text-[14px] text-fg-muted">{data.monthly_eur ? `€${data.monthly_eur} + VAT / month` : 'Free'}</p>
        </div>
        <div className="rounded-3xl bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <CalendarClock className="size-4" /> {data.status === 'active' ? 'Current period' : 'Status'}
          </p>
          <p className="mt-2 text-[22px] font-semibold">{data.period ? `${formatDate(data.period.start)} – ${formatDate(data.period.end)}` : 'No subscription'}</p>
          <p className="text-[14px] text-fg-muted">{data.renews_at ? `Renews ${formatDate(data.renews_at)} · new invoice then` : 'Upgrade any time'}</p>
        </div>
        <div className="rounded-3xl bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <Wallet className="size-4" /> Open balance
          </p>
          <p className="mt-2 text-[22px] font-semibold">{formatMoney(data.open_amount, data.invoicing.currency)}</p>
          <p className="text-[14px] text-fg-muted">{open.length ? `${open.length} unpaid ${open.length === 1 ? 'invoice' : 'invoices'} · bank transfer` : 'All paid'}</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {data.status === 'active' ? (
          <ButtonLink to="/studio/upgrade?plan=business">Change plan</ButtonLink>
        ) : (
          <ButtonLink to="/studio/upgrade?plan=plus" variant="primary">
            Upgrade to Plus
          </ButtonLink>
        )}
      </div>

      <section className="rounded-3xl bg-ink-900 p-6" aria-labelledby="usage-title">
        <h2 id="usage-title" className="flex items-center gap-2 text-[19px] font-semibold">
          <Gauge className="size-5 text-accent" /> What you’ve used
        </h2>
        <ul className="mt-4 space-y-4">
          {data.usage.map((u) => {
            const pct = u.used === null ? 0 : Math.min(100, (u.used / Math.max(u.limit, 1)) * 100)
            return (
              <li key={u.key}>
                <div className="flex justify-between text-[14px]">
                  <span className="text-fg-muted">{u.label}</span>
                  <span className="font-medium">{u.used === null ? `up to ${u.limit}` : `${u.used} of ${u.limit}`}</span>
                </div>
                {u.used !== null && (
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label={u.label} aria-valuenow={u.used} aria-valuemax={u.limit}>
                    <div className={pct >= 100 ? 'h-full rounded-full bg-warning' : 'h-full rounded-full bg-accent'} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="invoices-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="invoices-title" className="text-[21px] font-semibold">
            Invoices
          </h2>
          <Link to="/studio/invoicing" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-accent">
            <PlugZap className="size-4" /> {data.invoicing.connected ? 'Számlázz.hu connected' : 'Connect Számlázz.hu'}
          </Link>
        </div>
        {!data.invoicing.connected && (
          <div className="flex gap-3 rounded-2xl bg-[#FBF1DC] p-4 text-[14px] leading-relaxed text-warning">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Invoices are drafts until Számlázz.hu is connected.</span> A draft shows what will be invoiced but isn’t a valid invoice and isn’t sent. Once connected, new and renewal invoices are issued automatically and emailed to the billing address.
            </p>
          </div>
        )}
        {data.invoices.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[14px] text-fg-muted">No invoices yet. The first one is created when a paid plan starts.</p>
        ) : (
          <InvoiceList
            invoices={data.invoices}
            connected={data.invoicing.connected}
            showBuyer={false}
            pdfUrl={(i) => api.subscriptionInvoicePdf(i.id)}
            onView={setViewing}
            onIssue={(i) => act(`issue-${i.id}`, () => api.issueSubscriptionInvoice(i.id))}
            onTogglePaid={(i) => act(`paid-${i.id}`, () => api.toggleSubscriptionInvoicePaid(i.id))}
            busy={busy}
          />
        )}
      </section>

      <form onSubmit={save} noValidate className="rounded-3xl border border-line-soft bg-white p-6">
        <h2 className="flex items-center gap-2 text-[19px] font-semibold">
          <FileText className="size-5 text-accent" /> Billing details
        </h2>
        <p className="mt-1 text-[14px] text-fg-muted">Invoices are made out to these details and emailed to the billing email.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {input('company', 'Company name', 'text', 'organization')}
          {input('billing_email', 'Billing email', 'email', 'email')}
          {input('postcode', 'Postcode', 'text', 'postal-code')}
          {input('city', 'City', 'text', 'address-level2')}
          {input('address', 'Street address', 'text', 'street-address')}
          {input('tax_number', 'Tax number')}
        </div>
        <Button type="submit" variant="primary" className="mt-5" loading={busy === 'save'} disabled={!form.company.trim() || !form.billing_email.trim()}>
          Save details
        </Button>
      </form>

      {data.history.length > 0 && (
        <details className="rounded-3xl bg-ink-900 p-6">
          <summary className="cursor-pointer text-[16px] font-semibold">Plan changes</summary>
          <ul className="mt-3 space-y-1.5 text-[14px]">
            {data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {formatDate(h.at)} · {h.kind === 'checkout' ? `Upgrade to ${PLAN_NAMES[h.plan] ?? h.plan}` : `Switched to ${PLAN_NAMES[h.plan] ?? h.plan}`}
                </span>
                <span className="text-fg-subtle">{h.by}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-center text-[14px] text-fg-muted">
        Questions about billing?{' '}
        <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="text-accent">
          Contact Integrint
        </a>
      </p>

      <InvoiceDialog invoice={viewing} open={!!viewing} onClose={() => setViewing(null)} seller="Code Your Reality by Integrint (details from the connected Számlázz.hu account)" />
    </div>
  )
}
