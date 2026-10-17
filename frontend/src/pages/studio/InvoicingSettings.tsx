import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components/ui/primitives'
import { InvoicingSettingsForm } from '../../components/invoicing/InvoicingSettingsForm'
import { api } from '../../lib/api'

/** Founding admin: where Code Your Reality's own subscription invoices are issued. */
export default function InvoicingSettings() {
  const qc = useQueryClient()
  const cfg = useQuery({ queryKey: ['platform-invoicing'], queryFn: api.platformInvoicing })
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/studio/billing" className="inline-flex items-center gap-1.5 text-[14px] text-accent">
        <ArrowLeft className="size-4" /> Subscription & invoices
      </Link>
      <h1 className="display mt-3 text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Invoicing</h1>
      <p className="mt-2 text-[16px] text-fg-muted">How subscription invoices are issued to Plus and Business subscribers. Only you, the founding admin, can change this.</p>
      {cfg.data?.connected && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-[#E7F6EA] p-3 text-[14px] font-medium text-success">
          <CheckCircle2 className="size-4" /> Számlázz.hu is connected {cfg.data.agent_key_hint ? `(key ${cfg.data.agent_key_hint})` : ''}.
        </p>
      )}
      <div className="mt-6">
        {cfg.isLoading ? (
          <LoadingState />
        ) : cfg.isError ? (
          <ErrorState error={cfg.error} onRetry={() => cfg.refetch()} />
        ) : (
          <InvoicingSettingsForm
            key={`${cfg.data!.provider}-${cfg.data!.agent_key_hint}`}
            config={cfg.data!}
            autoIssueHint="When a subscription starts or renews, the invoice is issued and emailed right away."
            onSave={async (body) => {
              qc.setQueryData(['platform-invoicing'], await api.setPlatformInvoicing(body))
              qc.invalidateQueries({ queryKey: ['billing'] })
            }}
          />
        )}
      </div>
    </div>
  )
}
