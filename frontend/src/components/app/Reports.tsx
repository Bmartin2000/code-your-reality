import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ShieldCheck, Table2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { AppReports, EntityReport, ReportSeriesPoint } from '../../lib/types'
import { ErrorState, LoadingState } from '../ui/primitives'
import { formatValue } from '../../lib/format'
import { cn } from '../../lib/cn'

const MARK = '#0077BE' // brand-700: 4.8:1 on white, so thin marks stay visible

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-3xl bg-ink-900 p-5">
      <p className="text-[14px] text-fg-subtle">{label}</p>
      <p className="display mt-1 text-[34px] leading-none text-fg">{value}</p>
      {note && <p className="mt-2 text-[13px] text-fg-subtle">{note}</p>}
    </div>
  )
}

/** Single-series daily bar chart with a hover tooltip and a table fallback. */
function DailyBars({ title, series, unit }: { title: string; series: ReportSeriesPoint[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...series.map((p) => p.count))
  const total = series.reduce((a, p) => a + p.count, 0)
  const W = 600
  const H = 140
  const gap = 2
  const bw = W / series.length - gap
  const h = hover != null ? series[hover] : null
  return (
    <figure className="rounded-3xl bg-ink-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <figcaption>
          <p className="text-[16px] font-semibold">{title}</p>
          <p className="text-[13px] text-fg-subtle">
            Last 30 days · {total} {unit}
          </p>
        </figcaption>
        <button onClick={() => setTable(!table)} className="inline-flex items-center gap-1 text-[13px] text-accent" aria-pressed={table}>
          <Table2 className="size-4" /> {table ? 'Chart' : 'Table'}
        </button>
      </div>
      {table ? (
        <div className="mt-3 max-h-56 overflow-y-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-fg-subtle">
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {series.filter((p) => p.count).map((p) => (
                <tr key={p.date} className="border-t border-line-soft">
                  <td className="py-1">{formatValue('date', p.date)}</td>
                  <td className="py-1 text-right tabular-nums">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 && <p className="py-2 text-[14px] text-fg-subtle">Nothing yet.</p>}
        </div>
      ) : (
        <div className="relative mt-4">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label={`${title}: ${total} ${unit} in the last 30 days`} onMouseLeave={() => setHover(null)}>
            <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#D6DEE3" vectorEffect="non-scaling-stroke" />
            {series.map((p, i) => {
              const bh = p.count ? Math.max(3, (p.count / max) * (H - 8)) : 0
              const x = i * (bw + gap)
              return (
                <g key={p.date}>
                  {bh > 0 && <rect x={x} y={H - bh} width={bw} height={bh} rx="2" fill={MARK} opacity={hover == null || hover === i ? 1 : 0.45} />}
                  <rect x={x - gap / 2} y={0} width={bw + gap} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              )
            })}
          </svg>
          <div className="mt-1.5 flex justify-between text-[12px] text-fg-subtle">
            <span>{formatValue('date', series[0]?.date)}</span>
            <span>Today</span>
          </div>
          {h && (
            <div className="pointer-events-none absolute -top-2 rounded-xl bg-fg px-3 py-1.5 text-[12px] text-white shadow-lg" style={{ left: `clamp(0px, ${(hover! / series.length) * 100}% - 40px, calc(100% - 120px))` }}>
              {formatValue('date', h.date)} · <span className="font-semibold">{h.count}</span> {unit}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

/** Horizontal magnitude bars with direct labels (values in text ink, mark in brand). */
function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="rounded-3xl bg-ink-900 p-5">
      <p className="text-[16px] font-semibold">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} title={`${r.label}: ${r.count}`}>
            <div className="flex justify-between text-[14px]">
              <span className="truncate text-fg-muted">{r.label}</span>
              <span className="font-medium tabular-nums">{r.count}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-ink-800">
              <div className="h-2 rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: MARK }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EntitySection({ e }: { e: EntityReport }) {
  return (
    <section className="space-y-3" aria-labelledby={`rep-${e.key}`}>
      <h2 id={`rep-${e.key}`} className="text-[21px] font-semibold">
        {e.plural_label}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`All ${e.plural_label.toLowerCase()}`} value={e.total} note={`${e.created_last_30_days} added in 30 days`} />
        {e.lifecycle && <Stat label="Open now" value={e.lifecycle.open} note={`${e.lifecycle.closed} completed`} />}
        {e.lifecycle?.avg_hours_to_close != null && (
          <Stat label="Average time to complete" value={e.lifecycle.avg_hours_to_close >= 48 ? `${(e.lifecycle.avg_hours_to_close / 24).toFixed(1)} d` : `${e.lifecycle.avg_hours_to_close} h`} />
        )}
        {e.numeric.map((n) => (
          <Stat key={n.field} label={`Total ${n.label.toLowerCase()}`} value={n.type === 'money' ? formatValue('money', n.sum) : n.sum} note={`Average ${n.type === 'money' ? formatValue('money', n.avg) : n.avg}`} />
        ))}
      </div>
      {e.lifecycle && e.lifecycle.overdue_count > 0 && (
        <div className="flex items-start gap-3 rounded-3xl bg-[#FBF1DC] p-5 text-warning">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {e.lifecycle.overdue_count} overdue (past {e.lifecycle.due_field?.toLowerCase()})
            </p>
            <ul className="mt-1 text-[14px]">
              {e.lifecycle.overdue.map((o) => (
                <li key={o.id}>
                  {o.title} · due {formatValue('date', o.due)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <DailyBars title={`New ${e.plural_label.toLowerCase()} per day`} series={e.per_day} unit={e.plural_label.toLowerCase()} />
        {e.breakdowns.map((b) => (
          <Breakdown key={b.field} title={`By ${b.label.toLowerCase()}`} rows={b.values.map((v) => ({ label: v.label, count: v.count }))} />
        ))}
        {e.top_references.map((t) => (
          <Breakdown key={t.field} title={`Most frequent ${t.label.toLowerCase()}`} rows={t.top.map((x) => ({ label: x.title, count: x.count }))} />
        ))}
      </div>
    </section>
  )
}

export function Reports({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ['app-data', slug, 'reports'], queryFn: () => api.reports(slug) })
  if (q.isLoading) return <LoadingState />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const r = q.data as AppReports
  return (
    <div className="space-y-10">
      <div>
        <h1 className="display text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.08]">Reports</h1>
        <p className="mt-1 text-[15px] text-fg-muted">Calculated from your records and their history.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Operations" value={r.operations} note="Records added, changed or moved on" />
        <Stat label="Mistakes prevented" value={r.rejections} note="Actions your rules refused" />
        <Stat label="Lists" value={r.entities.length} />
      </div>
      {r.rules_that_stopped_mistakes.length > 0 && (
        <div className="rounded-3xl bg-[#E6F4EE] p-5">
          <p className="flex items-center gap-2 font-semibold text-success">
            <ShieldCheck className="size-5" /> Rules that stopped mistakes
          </p>
          <ul className="mt-2 space-y-1 text-[15px] text-fg-muted">
            {r.rules_that_stopped_mistakes.map((x) => (
              <li key={x.statement}>
                <span className="font-semibold tabular-nums text-fg">{x.count}×</span> {x.statement}
              </li>
            ))}
          </ul>
        </div>
      )}
      <DailyBars title="Activity per day" series={r.activity} unit="events" />
      {r.entities.map((e) => (
        <EntitySection key={e.key} e={e} />
      ))}
      <p className={cn('text-[13px] text-fg-subtle')}>Updated {new Date(r.generated_at).toLocaleTimeString()}</p>
    </div>
  )
}
