import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, Copy, FileSpreadsheet, Mic, Trash2, Webhook } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorState, LoadingState } from '../ui/primitives'
import { Button } from '../ui/Button'
import { PlusGate } from '../studio/PlusGate'
import { toast } from '../../lib/toast'
import { timecode } from '../../lib/format'
import { cn } from '../../lib/cn'

function CopyField({ value }: { value: string }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2.5 text-[13px] text-fg-muted">{value}</code>
      <Button
        size="sm"
        variant="secondary"
        icon={<Copy className="size-4" />}
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copied'), () => toast.error('Copy failed', value))}
      >
        Copy
      </Button>
    </div>
  )
}

export function Connections({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ['app-data', slug, 'integrations'], queryFn: () => api.integrations(slug) })
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['app-data', slug, 'integrations'] })

  if (q.isLoading) return <LoadingState />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const d = q.data!
  const mentioned = d.tools.filter((t) => t.mentioned)

  const addHook = async () => {
    setBusy(true)
    try {
      await api.addWebhook(slug, url.trim())
      setUrl('')
      refresh()
      toast.success('Webhook added', 'Every change in the app will be sent there.')
    } catch (e) {
      toast.error('Could not add the webhook', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.08]">Connections</h1>
        <p className="mt-1 text-[15px] text-fg-muted">Link your app to the tools you already use.</p>
      </div>

      {mentioned.length > 0 && (
        <section className="rounded-3xl bg-brand-50 p-5" aria-labelledby="mentioned">
          <h2 id="mentioned" className="flex items-center gap-2 text-[17px] font-semibold">
            <Mic className="size-5 text-accent" /> You mentioned these in your recording
          </h2>
          <ul className="mt-3 space-y-2">
            {mentioned.map((t) => (
              <li key={t.id} className="rounded-2xl bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{t.name}</span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold', t.status === 'available' ? 'bg-[#E6F4EE] text-success' : 'bg-ink-850 text-fg-subtle')}>
                    {t.status === 'available' ? 'Available' : 'Planned'}
                  </span>
                </div>
                {t.evidence && (
                  <p className="mt-1.5 text-[14px] text-fg-muted">
                    {t.evidence.start != null && <span className="font-medium text-fg-subtle">{timecode(t.evidence.start)} · </span>}“{t.evidence.quote}”
                  </p>
                )}
                <p className="mt-1.5 text-[14px] text-fg-subtle">{t.via}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-3xl bg-ink-900 p-5">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold">
          <FileSpreadsheet className="size-5 text-accent" /> Spreadsheets (Excel, Google Sheets)
        </h2>
        <p className="mt-1 text-[15px] text-fg-muted">Download any list as a CSV file. Available on every plan.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {d.csv.map((c) => (
            <a key={c.entity} href={api.csvUrl(c.path, slug)} className="inline-flex h-9 items-center rounded-full border border-line bg-white px-4 text-[14px] font-medium hover:bg-ink-850">
              {c.label}.csv
            </a>
          ))}
        </div>
      </section>

      {!d.unlocked ? (
        <PlusGate title="Connect your calendar and other systems" body="With Plus every date in your app appears in Google Calendar, Outlook or Apple Calendar, and every change can be sent to Zapier, Make or your own systems." />
      ) : (
        <>
          <section className="rounded-3xl bg-ink-900 p-5">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold">
              <CalendarDays className="size-5 text-accent" /> Calendar (Google, Outlook, Apple)
            </h2>
            <p className="mt-1 text-[15px] text-fg-muted">Subscribe to this address in your calendar app (“Add calendar → From URL”). Every date field appears as an all-day event. The server must be reachable from the calendar service.</p>
            {d.calendar_path && <CopyField value={`${window.location.origin}${d.calendar_path}`} />}
          </section>

          <section className="rounded-3xl bg-ink-900 p-5">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold">
              <Webhook className="size-5 text-accent" /> Webhooks (Zapier, Make, your own systems)
            </h2>
            <p className="mt-1 text-[15px] text-fg-muted">Each new record, status change, effect and refused action is sent as JSON to your address, signed with the secret (header X-CYR-Signature).</p>
            <ul className="mt-3 space-y-2">
              {d.webhooks.map((h) => (
                <li key={h.id} className="rounded-2xl bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <code className="min-w-0 truncate text-[13px]">{h.url}</code>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const r = await api.testWebhook(slug, h.id).catch((e: Error) => ({ status: e.message }))
                          toast.info('Test sent', `Response: ${r.status}`)
                          refresh()
                        }}
                      >
                        Test
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Remove webhook" onClick={() => api.deleteWebhook(slug, h.id).then(refresh)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-[12px] text-fg-subtle">
                    Secret: <code>{h.secret}</code> {h.last_status && <>· last response: {h.last_status}</>}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input className="field-input" placeholder="https://hooks.zapier.com/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Webhook address" />
              <Button variant="primary" loading={busy} disabled={url.trim().length < 8} onClick={addHook} icon={<Check className="size-4" />}>
                Add
              </Button>
            </div>
          </section>
        </>
      )}

      <section className="rounded-3xl bg-ink-900 p-5">
        <h2 className="text-[17px] font-semibold">Coming next</h2>
        <ul className="mt-2 space-y-1.5 text-[15px] text-fg-muted">
          {d.tools
            .filter((t) => t.status === 'planned')
            .map((t) => (
              <li key={t.id}>
                · <span className="font-medium text-fg">{t.name}</span> — {t.via.replace('Planned: ', '')}
              </li>
            ))}
        </ul>
        <p className="mt-3 text-[13px] text-fg-subtle">Need one of these now? Integrint can build it for you.</p>
      </section>
    </div>
  )
}
