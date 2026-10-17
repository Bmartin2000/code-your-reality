import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { AppRecord, ManifestEntity } from '../../lib/types'
import { formatValue } from '../../lib/format'
import { cn } from '../../lib/cn'

const TONE_BAR = { success: 'bg-success', active: 'bg-accent', warning: 'bg-warning', neutral: 'bg-fg-subtle' } as const

/**
 * Pipeline board (as in Pipedrive or Odoo CRM): one column per state, a card per record, and the
 * allowed next steps on each card. Moving still goes through the server's transition rules.
 */
export function Board({
  slug,
  entity,
  rows,
  columns,
  canMove,
  onMove,
}: {
  slug: string
  entity: ManifestEntity
  rows: AppRecord[]
  columns: string[]
  canMove: boolean
  onMove: (rec: AppRecord, key: string, label: string) => void
}) {
  const state = entity.state!
  const fields = columns.map((c) => entity.fields.find((f) => f.key === c)).filter((f) => f && f.key !== state.field && f.key !== entity.title_field).slice(0, 3)
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-max auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3">
        {state.states.map((s) => {
          const cards = rows.filter((r) => String(r.data[state.field]) === s.key)
          const tone = (s.tone === 'success' || s.tone === 'active' || s.tone === 'warning' ? s.tone : 'neutral') as keyof typeof TONE_BAR
          return (
            <section key={s.key} className="flex min-h-[220px] flex-col rounded-2xl bg-ink-900 p-2.5" aria-label={`${s.label} column`}>
              <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
                <span className={cn('size-2 rounded-full', TONE_BAR[tone])} aria-hidden />
                <h3 className="text-[14px] font-semibold">{s.label}</h3>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 font-mono text-[11px] text-fg-muted">{cards.length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2">
                {cards.map((r) => (
                  <li key={r.id} className="rounded-xl border border-line-soft bg-white p-3 shadow-[0_1px_2px_rgba(11,27,38,0.04)]">
                    <Link to={`/apps/${slug}/${entity.key}/${r.id}`} className="block">
                      <span className="font-mono text-[10.5px] text-fg-subtle">{r.code}</span>
                      <span className="mt-0.5 block text-[14px] font-medium leading-snug text-fg">{r.title}</span>
                      {fields.length > 0 && (
                        <span className="mt-1.5 block space-y-0.5 text-[12.5px] text-fg-muted">
                          {fields.map((f) => (
                            <span key={f!.key} className="block truncate">
                              <span className="text-fg-subtle">{f!.label}: </span>
                              {f!.type === 'reference' ? r.refs[f!.key]?.title ?? '—' : formatValue(f!.type, r.data[f!.key])}
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                    {canMove && r.transitions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line-soft pt-2.5">
                        {r.transitions.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => onMove(r, t.key, t.label)}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent hover:text-white"
                          >
                            {t.label} <ArrowRight className="size-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
                {cards.length === 0 && <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-fg-subtle">Nothing here</li>}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
