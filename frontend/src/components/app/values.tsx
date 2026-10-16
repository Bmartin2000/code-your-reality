import { Link } from 'react-router-dom'
import type { AppRecord, ManifestEntity, ManifestField } from '../../lib/types'
import { formatValue, humanize } from '../../lib/format'
import { cn } from '../../lib/cn'

const POSITIVE = new Set(['available', 'returned', 'done', 'complete', 'completed', 'closed', 'paid', 'free', 'active_ok'])
const ACTIVE = new Set(['rented', 'active', 'open', 'in_progress', 'out', 'started'])
const WARN = new Set(['maintenance', 'overdue', 'blocked', 'on_hold', 'damaged'])

export function toneFor(entity: ManifestEntity, field: ManifestField, value: string): 'success' | 'active' | 'warning' | 'neutral' {
  if (entity.state && entity.state.field === field.key) {
    const s = entity.state.states.find((x) => x.key === value)
    if (s) return s.tone === 'success' ? 'success' : s.tone === 'active' ? 'active' : s.tone === 'warning' ? 'warning' : 'neutral'
  }
  const v = value.toLowerCase()
  if (POSITIVE.has(v)) return 'success'
  if (ACTIVE.has(v)) return 'active'
  if (WARN.has(v)) return 'warning'
  return 'neutral'
}

const TONE_CLS = {
  success: 'text-success border-success/30 bg-success/[0.07]',
  active: 'text-accent border-accent/35 bg-accent/[0.07]',
  warning: 'text-warning border-warning/30 bg-warning/[0.07]',
  neutral: 'text-fg-muted border-line bg-ink-800',
}

export function Pill({ tone, children, className }: { tone: keyof typeof TONE_CLS; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium', TONE_CLS[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  )
}

export function stateLabel(entity: ManifestEntity, field: ManifestField, value: string) {
  if (entity.state && entity.state.field === field.key) return entity.state.states.find((s) => s.key === value)?.label ?? value
  return humanize(value)
}

export function FieldValue({ slug, entity, field, record }: { slug: string; entity: ManifestEntity; field: ManifestField; record: AppRecord }) {
  const v = record.data[field.key]
  if (field.type === 'reference') {
    const ref = record.refs[field.key]
    if (!ref) return <span className="text-fg-subtle">—</span>
    return (
      <Link to={`/apps/${slug}/${field.ref_entity}/${ref.id}`} className="text-fg underline decoration-line underline-offset-4 hover:decoration-accent" onClick={(e) => e.stopPropagation()}>
        {ref.title}
      </Link>
    )
  }
  if (field.type === 'enum' && typeof v === 'string') return <Pill tone={toneFor(entity, field, v)}>{stateLabel(entity, field, v)}</Pill>
  if (field.type === 'money' && typeof v === 'number') return <span className="font-mono tabular-nums">{formatValue('money', v)}</span>
  return <span>{formatValue(field.type, v)}</span>
}
