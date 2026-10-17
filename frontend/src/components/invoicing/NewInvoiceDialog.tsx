import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog } from '../ui/overlays'
import { Button } from '../ui/Button'
import { LoadingState } from '../ui/primitives'
import { api } from '../../lib/api'
import type { InvoiceBuyer, InvoiceInfo, InvoiceLine, InvoicingConfig } from '../../lib/types'
import { formatMoney } from './InvoiceParts'

const EMPTY_BUYER: InvoiceBuyer = { name: '', email: '', postcode: '', city: '', address: '', tax_number: '' }

function lineTotal(l: InvoiceLine) {
  const net = Number(l.quantity) * Number(l.unit_price)
  const rate = /^\d+$/.test(l.vat_rate) ? Number(l.vat_rate) : 0
  return { net, gross: net + (net * rate) / 100 }
}

/** New invoice for a customer of the business, optionally started from a record (e.g. a rental). */
export function NewInvoiceDialog({
  slug,
  config,
  from,
  open,
  onClose,
  onCreated,
}: {
  slug: string
  config: InvoicingConfig
  from?: { entity: string; id: string } | null
  open: boolean
  onClose: () => void
  onCreated: (inv: InvoiceInfo) => void
}) {
  const [buyer, setBuyer] = useState<InvoiceBuyer>(EMPTY_BUYER)
  const [items, setItems] = useState<InvoiceLine[]>([{ name: '', quantity: 1, unit: 'db', unit_price: 0, vat_rate: config.vat_rate }])
  const [record, setRecord] = useState<{ id: string; code: string; title: string } | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !from) return
    setLoading(true)
    api
      .invoicePrefill(slug, from.entity, from.id)
      .then((p) => {
        setBuyer({ ...EMPTY_BUYER, ...p.buyer })
        setItems(p.items.map((i) => ({ ...i, vat_rate: config.vat_rate })))
        setRecord(p.record)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [open, from?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (i: number, patch: Partial<InvoiceLine>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const totals = items.reduce((a, l) => ({ net: a.net + lineTotal(l).net, gross: a.gross + lineTotal(l).gross }), { net: 0, gross: 0 })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!buyer.name.trim()) return setError('Enter the buyer’s name.')
    if (items.some((l) => !String(l.name).trim() || Number(l.quantity) <= 0 || Number(l.unit_price) < 0)) return setError('Every line needs a name, a quantity above zero and a price.')
    setBusy(true)
    try {
      const inv = await api.createAppInvoice(slug, { record_id: record?.id ?? null, buyer, items: items.map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })), note })
      onCreated(inv)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = (k: keyof InvoiceBuyer, label: string, type = 'text') => (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-fg-muted">{label}</span>
      <input className="field-input" type={type} value={buyer[k] ?? ''} onChange={(e) => setBuyer({ ...buyer, [k]: e.target.value })} />
    </label>
  )

  return (
    <Dialog open={open} onClose={onClose} wide title={record ? `Invoice for ${record.code}` : 'New invoice'} description={config.connected ? (config.auto_issue ? 'It will be issued through Számlázz.hu right away.' : 'Saved as a draft; issue it when you’re ready.') : 'Saved as a draft. Connect Számlázz.hu in invoicing settings to issue real invoices.'}>
      {loading ? (
        <LoadingState />
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-[15px] font-semibold">Buyer</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('name', 'Name')}
              {field('email', 'Email (the invoice is sent here)', 'email')}
              {field('postcode', 'Postcode')}
              {field('city', 'City')}
              {field('address', 'Street address')}
              {field('tax_number', 'Tax number (companies)')}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[15px] font-semibold">Lines</legend>
            <ul className="space-y-2">
              {items.map((l, i) => (
                <li key={i} className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-900 p-3 sm:grid-cols-[2fr_80px_80px_110px_90px_auto]">
                  <input className="field-input col-span-2 sm:col-span-1" aria-label={`Line ${i + 1} item`} placeholder="Item or service" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} />
                  <input className="field-input" aria-label={`Line ${i + 1} quantity`} type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <input className="field-input" aria-label={`Line ${i + 1} unit`} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                  <input className="field-input" aria-label={`Line ${i + 1} unit price`} type="number" min={0} step="any" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                  <select className="field-input" aria-label={`Line ${i + 1} VAT`} value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: e.target.value })}>
                    {['27', '18', '5', '0', 'AAM', 'TAM', 'EU', 'EUK'].map((v) => (
                      <option key={v} value={v}>
                        {/^\d+$/.test(v) ? `${v}%` : v}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="flex items-center justify-center rounded-full text-fg-subtle hover:text-error disabled:opacity-30">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Button size="sm" className="mt-2" icon={<Plus className="size-3.5" />} onClick={() => setItems((xs) => [...xs, { name: '', quantity: 1, unit: 'db', unit_price: 0, vat_rate: config.vat_rate }])}>
              Add line
            </Button>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-fg-muted">Note (optional)</span>
            <input className="field-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px]">
              Net {formatMoney(totals.net, config.currency)} · <span className="font-semibold">Total {formatMoney(totals.gross, config.currency)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {config.connected && config.auto_issue ? 'Issue invoice' : 'Save draft'}
              </Button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-[14px] text-error">
              {error}
            </p>
          )}
        </form>
      )}
    </Dialog>
  )
}
