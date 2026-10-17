import { useRef } from 'react'
import { AlertTriangle, CheckCircle2, Download, Eye, FileClock, Printer, Send, Trash2 } from 'lucide-react'
import { Dialog } from '../ui/overlays'
import { Button } from '../ui/Button'
import type { InvoiceInfo } from '../../lib/types'

export function formatMoney(amount: string | number, currency: string) {
  const n = typeof amount === 'number' ? amount : Number(amount)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: currency === 'HUF' ? 0 : 2 }).format(n)
  } catch {
    return `${n} ${currency}`
  }
}

export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

export function InvoiceStatus({ invoice }: { invoice: InvoiceInfo }) {
  if (invoice.status === 'issued' && invoice.paid_at)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F6EA] px-2 py-0.5 text-[12px] font-medium text-success">
        <CheckCircle2 className="size-3" /> Paid
      </span>
    )
  if (invoice.status === 'issued')
    return <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[12px] font-medium text-accent">Issued · due {formatDate(invoice.due_date)}</span>
  if (invoice.status === 'failed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FCE9EC] px-2 py-0.5 text-[12px] font-medium text-error" title={invoice.error ?? ''}>
        <AlertTriangle className="size-3" /> Not issued
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FBF1DC] px-2 py-0.5 text-[12px] font-medium text-warning">
      <FileClock className="size-3" /> Draft{invoice.paid_at ? ' · paid' : ''}
    </span>
  )
}

export function InvoiceList({
  invoices,
  connected,
  pdfUrl,
  onView,
  onIssue,
  onTogglePaid,
  onDelete,
  busy,
  showBuyer = true,
}: {
  invoices: InvoiceInfo[]
  connected: boolean
  pdfUrl: (inv: InvoiceInfo) => string
  onView: (inv: InvoiceInfo) => void
  onIssue: (inv: InvoiceInfo) => void
  onTogglePaid?: (inv: InvoiceInfo) => void
  onDelete?: (inv: InvoiceInfo) => void
  busy?: string | null
  showBuyer?: boolean
}) {
  return (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-white">
      {invoices.map((inv) => (
        <li key={inv.id} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center">
          <button onClick={() => onView(inv)} className="min-w-0 flex-1 text-left">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12.5px] text-fg">{inv.number ?? inv.draft_number}</span>
              <InvoiceStatus invoice={inv} />
            </span>
            <span className="mt-1 block truncate text-[13.5px] text-fg-muted">
              {showBuyer ? `${inv.buyer.name || 'No buyer name'} · ` : ''}
              {inv.period_start ? `${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}` : formatDate(inv.issue_date)}
              {inv.record ? ` · ${inv.record.code}` : ''}
            </span>
            {inv.status === 'failed' && inv.error && <span className="mt-1 block text-[12.5px] text-error">{inv.error}</span>}
          </button>
          <span className="shrink-0 text-[16px] font-semibold tabular-nums md:w-32 md:text-right">{formatMoney(inv.gross, inv.currency)}</span>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Button size="sm" variant="quiet" icon={<Eye className="size-3.5" />} onClick={() => onView(inv)}>
              View
            </Button>
            {inv.status !== 'issued' && connected && (
              <Button size="sm" variant="primary" loading={busy === `issue-${inv.id}`} icon={<Send className="size-3.5" />} onClick={() => onIssue(inv)}>
                {inv.status === 'failed' ? 'Try again' : 'Issue'}
              </Button>
            )}
            {inv.has_pdf && (
              <a href={pdfUrl(inv)} className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-fg-muted ring-1 ring-line-soft hover:text-fg">
                <Download className="size-3.5" /> PDF
              </a>
            )}
            {onTogglePaid && inv.status === 'issued' && (
              <Button size="sm" variant="quiet" loading={busy === `paid-${inv.id}`} onClick={() => onTogglePaid(inv)}>
                {inv.paid_at ? 'Mark unpaid' : 'Mark paid'}
              </Button>
            )}
            {onDelete && inv.status !== 'issued' && (
              <Button size="sm" variant="quiet" aria-label={`Delete ${inv.draft_number}`} icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(inv)}>
                <span className="sr-only">Delete</span>
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The invoice as a document, with print. A draft is clearly marked as not (yet) a valid invoice. */
export function InvoiceDialog({ invoice, seller, open, onClose }: { invoice: InvoiceInfo | null; seller: string; open: boolean; onClose: () => void }) {
  const doc = useRef<HTMLDivElement>(null)
  if (!invoice) return null
  const draft = invoice.status !== 'issued'
  const print = () => {
    const w = window.open('', '_blank', 'width=820,height=1000')
    if (!w || !doc.current) return
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.number ?? invoice.draft_number}</title><style>body{font-family:Inter,system-ui,sans-serif;color:#0b1b26;margin:40px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #e3e8ee;font-size:13px}th{color:#5b6b78;font-weight:500}.r{text-align:right}.draft{border:2px solid #b7791f;color:#9a6412;padding:8px 12px;border-radius:8px;font-weight:600;margin-bottom:16px}</style></head><body>${doc.current.innerHTML}</body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={invoice.number ? `Invoice ${invoice.number}` : `Draft ${invoice.draft_number}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button icon={<Printer className="size-4" />} onClick={print}>
            Print
          </Button>
        </>
      }
    >
      <div ref={doc} className="text-[14px]">
        {draft && (
          <p className="draft mb-4 rounded-xl border-2 border-[#B7791F] px-3 py-2 font-semibold text-warning">
            DRAFT – not a valid invoice. It becomes one when it is issued through Számlázz.hu.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[12px] uppercase tracking-[0.06em] text-fg-subtle">Seller</p>
            <p className="mt-1 font-medium">{seller}</p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.06em] text-fg-subtle">Buyer</p>
            <p className="mt-1 font-medium">{invoice.buyer.name || '—'}</p>
            <p className="text-fg-muted">{[invoice.buyer.postcode, invoice.buyer.city, invoice.buyer.address].filter(Boolean).join(' ') || 'No address yet'}</p>
            {invoice.buyer.tax_number && <p className="text-fg-muted">Tax no. {invoice.buyer.tax_number}</p>}
            {invoice.buyer.email && <p className="text-fg-muted">{invoice.buyer.email}</p>}
          </div>
        </div>
        <p className="mt-4 text-fg-muted">
          Issued {formatDate(invoice.issue_date)} · Due {formatDate(invoice.due_date)} · Bank transfer
          {invoice.period_start ? ` · Period ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}` : ''}
        </p>
        <table className="mt-4 w-full text-left">
          <thead>
            <tr className="border-b border-line-soft text-[12px] text-fg-subtle">
              <th className="py-2 font-medium">Item</th>
              <th className="r py-2 text-right font-medium">Qty</th>
              <th className="r py-2 text-right font-medium">Unit price</th>
              <th className="r py-2 text-right font-medium">VAT</th>
              <th className="r py-2 text-right font-medium">Gross</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={i} className="border-b border-line-soft">
                <td className="py-2">{it.name}</td>
                <td className="r py-2 text-right tabular-nums">
                  {it.quantity} {it.unit}
                </td>
                <td className="r py-2 text-right tabular-nums">{formatMoney(it.unit_price, invoice.currency)}</td>
                <td className="r py-2 text-right">{/^\d+$/.test(it.vat_rate) ? `${it.vat_rate}%` : it.vat_rate}</td>
                <td className="r py-2 text-right tabular-nums">{formatMoney(it.gross ?? 0, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 ml-auto w-full max-w-[260px] space-y-1 text-[14px]">
          <p className="flex justify-between">
            <span className="text-fg-muted">Net</span> <span className="tabular-nums">{formatMoney(invoice.net, invoice.currency)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-fg-muted">VAT</span> <span className="tabular-nums">{formatMoney(invoice.vat, invoice.currency)}</span>
          </p>
          <p className="flex justify-between border-t border-line-soft pt-1 text-[16px] font-semibold">
            <span>Total</span> <span className="tabular-nums">{formatMoney(invoice.gross, invoice.currency)}</span>
          </p>
        </div>
        {invoice.note && <p className="mt-4 text-fg-muted">{invoice.note}</p>}
      </div>
    </Dialog>
  )
}
