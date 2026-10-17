import { useState } from 'react'
import { KeyRound, PlugZap } from 'lucide-react'
import { Button } from '../ui/Button'
import { fieldErrors, type InvoicingSettingsBody } from '../../lib/api'
import type { InvoicingConfig } from '../../lib/types'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/cn'

const VAT = [
  ['27', '27%'],
  ['18', '18%'],
  ['5', '5%'],
  ['0', '0%'],
  ['AAM', 'AAM – exempt'],
  ['TAM', 'TAM – exempt (activity)'],
  ['EU', 'EU – intra-community'],
  ['EUK', 'EUK – outside the EU'],
] as const

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="block text-[13.5px] text-fg-muted">{hint}</span>
      </span>
      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#0077BE]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** Connect Számlázz.hu (Számla Agent key) and set invoice defaults. The key is write-only. */
export function InvoicingSettingsForm({ config, onSave, autoIssueHint }: { config: InvoicingConfig; onSave: (body: InvoicingSettingsBody) => Promise<unknown>; autoIssueHint: string }) {
  const [form, setForm] = useState({
    provider: config.provider,
    e_invoice: config.e_invoice,
    send_email: config.send_email,
    auto_issue: config.auto_issue,
    language: config.language,
    currency: config.currency,
    vat_rate: config.vat_rate,
    payment_days: config.payment_days,
    note: config.note,
  })
  const [key, setKey] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e: React.FormEvent, extra: Partial<InvoicingSettingsBody> = {}) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      await onSave({ ...form, ...(key.trim() ? { agent_key: key.trim() } : {}), ...extra } as InvoicingSettingsBody)
      setKey('')
      toast.success(form.provider === 'szamlazz' && !extra.remove_agent_key ? 'Számlázz.hu connected' : 'Invoicing settings saved')
    } catch (err) {
      const f = fieldErrors(err)
      if (f) setErrors(f)
      else toast.error('Could not save', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div role="radiogroup" aria-label="Invoicing provider" className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { id: 'none', title: 'Drafts only', body: 'Invoices are prepared as drafts. Not valid invoices; nothing is sent.' },
            { id: 'szamlazz', title: 'Számlázz.hu', body: 'Invoices are issued through your Számlázz.hu account and emailed to the buyer.' },
          ] as const
        ).map((o) => (
          <button
            type="button"
            key={o.id}
            role="radio"
            aria-checked={form.provider === o.id}
            onClick={() => set('provider', o.id)}
            className={cn('rounded-2xl border-2 p-4 text-left', form.provider === o.id ? 'border-accent bg-brand-50' : 'border-line-soft bg-white hover:border-line')}
          >
            <span className="block text-[16px] font-semibold">{o.title}</span>
            <span className="mt-1 block text-[13.5px] text-fg-muted">{o.body}</span>
          </button>
        ))}
      </div>

      {form.provider === 'szamlazz' && (
        <div className="rounded-2xl bg-ink-900 p-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[15px] font-medium">
              <KeyRound className="size-4 text-accent" /> Számla Agent key
            </span>
            <input
              className="field-input"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={config.agent_key_set ? `Saved (${config.agent_key_hint ?? 'hidden'}). Type to replace` : 'Paste the key from Számlázz.hu'}
              aria-invalid={!!errors.agent_key || undefined}
            />
            {errors.agent_key && <span className="mt-1 block text-[13px] text-error">{errors.agent_key}</span>}
          </label>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            In Számlázz.hu: Settings → Számla Agent → create a key. The key is stored on the server only and is never shown again. Try it first with a free Számlázz.hu test account.
          </p>
          {config.agent_key_set && (
            <button type="button" className="mt-2 text-[13px] font-medium text-error" onClick={(e) => save(e, { provider: 'none', remove_agent_key: true })}>
              Disconnect and remove the key
            </button>
          )}
        </div>
      )}

      <div className="divide-y divide-line-soft rounded-2xl border border-line-soft bg-white px-4">
        <Toggle label="Issue automatically" hint={autoIssueHint} checked={form.auto_issue} onChange={(v) => set('auto_issue', v)} />
        <Toggle label="Email the invoice to the buyer" hint="Számlázz.hu sends the PDF to the buyer’s email address." checked={form.send_email} onChange={(v) => set('send_email', v)} />
        <Toggle label="E-invoice" hint="Electronic invoice (PDF) instead of a paper one." checked={form.e_invoice} onChange={(v) => set('e_invoice', v)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium">Currency</span>
          <select className="field-input" value={form.currency} onChange={(e) => set('currency', e.target.value as typeof form.currency)}>
            <option>HUF</option>
            <option>EUR</option>
            <option>USD</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium">Default VAT</span>
          <select className="field-input" value={form.vat_rate} onChange={(e) => set('vat_rate', e.target.value)}>
            {VAT.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium">Payment due (days)</span>
          <input className="field-input" type="number" min={0} max={90} value={form.payment_days} onChange={(e) => set('payment_days', Number(e.target.value))} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium">Invoice language</span>
          <select className="field-input" value={form.language} onChange={(e) => set('language', e.target.value as typeof form.language)}>
            <option value="hu">Hungarian</option>
            <option value="en">English</option>
            <option value="de">German</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-medium">Note on every invoice (optional)</span>
        <input className="field-input" maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Thank you for your business!" />
      </label>
      <Button type="submit" variant="primary" loading={busy} icon={<PlugZap className="size-4" />}>
        {form.provider === 'szamlazz' ? 'Save and connect' : 'Save settings'}
      </Button>
    </form>
  )
}
