import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Info, Plus, Settings2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { ConfirmDialog, Dialog } from '../ui/overlays'
import { EmptyState, ErrorState, LoadingState } from '../ui/primitives'
import { InvoiceDialog, InvoiceList, formatMoney } from '../invoicing/InvoiceParts'
import { InvoicingSettingsForm } from '../invoicing/InvoicingSettingsForm'
import { NewInvoiceDialog } from '../invoicing/NewInvoiceDialog'
import { api } from '../../lib/api'
import type { AppDetail, InvoiceInfo } from '../../lib/types'
import { toast } from '../../lib/toast'

export const invoicesKey = (slug: string) => ['app-data', slug, 'invoices'] as const

/** The business invoices its own customers: drafts, Számlázz.hu issuing, paid/unpaid. */
export function Invoices({ slug, app }: { slug: string; app: AppDetail }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: invoicesKey(slug), queryFn: () => api.appInvoices(slug) })
  const [creating, setCreating] = useState(false)
  const [settings, setSettings] = useState(false)
  const [viewing, setViewing] = useState<InvoiceInfo | null>(null)
  const [deleting, setDeleting] = useState<InvoiceInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const admin = app.viewer.permissions.includes('admin')

  if (q.isLoading) return <LoadingState />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const { config, invoices } = q.data!
  const unpaid = invoices.filter((i) => i.status === 'issued' && !i.paid_at)
  const outstanding = unpaid.reduce((a, i) => a + Number(i.gross), 0)
  const refresh = () => qc.invalidateQueries({ queryKey: invoicesKey(slug) })

  const act = async (key: string, fn: () => Promise<InvoiceInfo>) => {
    setBusy(key)
    try {
      const inv = await fn()
      if (inv.status === 'failed') toast.error('The invoice was not issued', inv.error ?? undefined)
      else if (key.startsWith('issue')) toast.success(`Invoice ${inv.number} issued`, inv.buyer.email && config.send_email ? `Számlázz.hu emails it to ${inv.buyer.email}.` : undefined)
      refresh()
    } catch (err) {
      toast.error('Something went wrong', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="display text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.05]">Invoices</h1>
          <p className="mt-1 text-[14.5px] text-fg-muted">
            {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
            {unpaid.length ? ` · ${formatMoney(outstanding, config.currency)} unpaid` : ''}
            {config.connected ? ' · Számlázz.hu connected' : ' · drafts only'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <Button icon={<Settings2 className="size-4" />} onClick={() => setSettings(true)}>
              Invoicing settings
            </Button>
          )}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New invoice
          </Button>
        </div>
      </div>

      {!config.connected && (
        <div className="flex gap-3 rounded-2xl bg-[#FBF1DC] p-4 text-[14px] leading-relaxed text-warning">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-semibold">Invoices are drafts until you connect Számlázz.hu.</span> A draft isn’t a valid invoice and isn’t sent.
            {admin ? ' Connect your own Számlázz.hu account in Invoicing settings to issue them and email them to your customers.' : ' Ask the app owner to connect Számlázz.hu.'}
          </p>
        </div>
      )}

      {invoices.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" />} title="No invoices yet" body="Create one here, or open a record (for example a rental) and press Invoice." />
      ) : (
        <InvoiceList
          invoices={invoices}
          connected={config.connected}
          pdfUrl={(i) => api.appInvoicePdf(slug, i.id)}
          onView={setViewing}
          onIssue={(i) => act(`issue-${i.id}`, () => api.issueAppInvoice(slug, i.id))}
          onTogglePaid={(i) => act(`paid-${i.id}`, () => api.toggleAppInvoicePaid(slug, i.id))}
          onDelete={setDeleting}
          busy={busy}
        />
      )}

      <NewInvoiceDialog
        key={creating ? 'new-open' : 'new-closed'}
        slug={slug}
        config={config}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(inv) => {
          setCreating(false)
          refresh()
          if (inv.status === 'failed') toast.error('Saved, but not issued', inv.error ?? undefined)
          else toast.success(inv.status === 'issued' ? `Invoice ${inv.number} issued` : `Draft ${inv.draft_number} saved`)
        }}
      />
      <InvoiceDialog invoice={viewing} open={!!viewing} onClose={() => setViewing(null)} seller={`${app.manifest.workflow.name} (details from Számlázz.hu once connected)`} />
      {admin && (
        <Dialog open={settings} onClose={() => setSettings(false)} wide title="Invoicing settings" description="Connect your own Számlázz.hu account to issue real invoices to your customers.">
          <InvoicingSettingsForm
            config={config}
            autoIssueHint="New invoices are issued and emailed as soon as you create them."
            onSave={async (body) => {
              await api.setAppInvoicing(slug, body)
              refresh()
              setSettings(false)
            }}
          />
        </Dialog>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.deleteAppInvoice(slug, deleting.id)
            refresh()
          } catch (err) {
            toast.error('Could not delete', (err as Error).message)
          }
          setDeleting(null)
        }}
        title={`Delete ${deleting?.draft_number}?`}
        description="Only drafts can be deleted. Issued invoices are cancelled in Számlázz.hu (storno)."
        confirmLabel="Delete draft"
        destructive
      />
    </div>
  )
}
