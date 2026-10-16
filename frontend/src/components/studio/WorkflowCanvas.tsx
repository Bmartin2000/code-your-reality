import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertCircle, Flag, Play, Repeat2, Zap } from 'lucide-react'
import type { Rule, Stage, WorkflowDefinition } from '../../lib/workflow-schema'
import type { Issue } from '../../lib/types'
import { cn } from '../../lib/cn'

const W = 196
const H = 84
const GX = 56
const GY = 22

const KIND = {
  start: { label: 'Start', icon: Play, color: '#0071E3' },
  action: { label: 'Action', icon: Zap, color: '#0071E3' },
  state: { label: 'State', icon: Repeat2, color: '#7D4CDB' },
  end: { label: 'Outcome', icon: Flag, color: '#1D8A3E' },
}

/** Rules that fire around a stage: guards/effects on its action's event, plus invariants on create. */
export function rulesForStage(d: WorkflowDefinition, stage: Stage): Rule[] {
  const action = stage.action ? d.actions.find((a) => a.id === stage.action) : undefined
  if (!action) return []
  const event = action.kind === 'create' ? 'create' : action.kind === 'transition' ? action.transition : null
  return d.rules.filter((r) => {
    if (r.review.status === 'rejected' || r.params.entity !== action.entity) return false
    if ('on' in r.params) return r.params.on === event
    return event === 'create' && r.kind !== 'note'
  })
}

function layout(stages: Stage[], vertical: boolean) {
  const idx = new Map(stages.map((s, i) => [s.id, i]))
  const level = new Map<string, number>(stages.map((s) => [s.id, 0]))
  // Longest-path layering; bounded iterations make cycles harmless.
  for (let iter = 0; iter < stages.length; iter++) {
    let changed = false
    for (const s of stages) {
      for (const n of s.next) {
        if (!idx.has(n) || idx.get(n)! <= idx.get(s.id)!) continue
        const want = level.get(s.id)! + 1
        if (want > level.get(n)!) {
          level.set(n, want)
          changed = true
        }
      }
    }
    if (!changed) break
  }
  const byLevel = new Map<number, Stage[]>()
  for (const s of stages) byLevel.set(level.get(s.id)!, [...(byLevel.get(level.get(s.id)!) ?? []), s])
  const maxLevel = Math.max(0, ...level.values())
  const maxRow = Math.max(1, ...[...byLevel.values()].map((l) => l.length))
  const pos = new Map<string, { x: number; y: number }>()
  for (const [lv, list] of byLevel) {
    list.forEach((s, row) => {
      const offset = ((maxRow - list.length) * (vertical ? W + GX : H + GY)) / 2
      if (vertical) pos.set(s.id, { x: offset + row * (W + GX), y: lv * (H + GX) })
      else pos.set(s.id, { x: lv * (W + GX), y: offset + row * (H + GY) })
    })
  }
  const width = vertical ? maxRow * (W + GX) - GX : (maxLevel + 1) * (W + GX) - GX
  const height = vertical ? (maxLevel + 1) * (H + GX) - GX : maxRow * (H + GY) - GY
  return { pos, width, height }
}

export function WorkflowCanvas({
  definition,
  issues,
  selectedId,
  onSelect,
}: {
  definition: WorkflowDefinition
  issues: Issue[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<string | null>(null)
  const reduce = useReducedMotion()
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>())

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const stages = definition.stages
  const horizontalWidth = stages.length * (W + GX)
  const vertical = width < 640 || horizontalWidth > width * 2.2
  const { pos, width: cw, height: ch } = useMemo(() => layout(stages, vertical), [stages, vertical])
  const stageIssues = useMemo(() => new Set(issues.filter((i) => i.target_kind === 'stage').map((i) => i.target_id)), [issues])
  const focus = hover ?? selectedId
  const preds = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of stages) for (const n of s.next) m.set(n, [...(m.get(n) ?? []), s.id])
    return m
  }, [stages])

  const edges = stages.flatMap((s) => s.next.filter((n) => pos.has(n)).map((n) => ({ from: s.id, to: n })))
  const pad = 16

  const onKey = (e: React.KeyboardEvent, s: Stage) => {
    const forward = vertical ? 'ArrowDown' : 'ArrowRight'
    const back = vertical ? 'ArrowUp' : 'ArrowLeft'
    let target: string | undefined
    if (e.key === forward) target = s.next[0]
    if (e.key === back) target = preds.get(s.id)?.[0]
    if (target) {
      e.preventDefault()
      nodeRefs.current.get(target)?.focus()
    }
  }

  return (
    <div ref={wrap} className="relative w-full overflow-x-auto pb-2">
      <div className="relative mx-auto" style={{ width: cw + pad * 2, height: ch + pad * 2, minWidth: '100%' }}>
        <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" aria-hidden>
          {edges.map(({ from, to }) => {
            const a = pos.get(from)!
            const b = pos.get(to)!
            const active = focus && (focus === from || focus === to)
            const d = vertical
              ? `M${a.x + W / 2 + pad} ${a.y + H + pad} C ${a.x + W / 2 + pad} ${a.y + H + pad + GX / 2}, ${b.x + W / 2 + pad} ${b.y + pad - GX / 2}, ${b.x + W / 2 + pad} ${b.y + pad}`
              : `M${a.x + W + pad} ${a.y + H / 2 + pad} C ${a.x + W + pad + GX / 2} ${a.y + H / 2 + pad}, ${b.x + pad - GX / 2} ${b.y + H / 2 + pad}, ${b.x + pad} ${b.y + H / 2 + pad}`
            return (
              <g key={`${from}-${to}`}>
                <path d={d} fill="none" stroke={active ? '#0071E3' : '#D2D2D7'} strokeWidth={active ? 1.5 : 1.2} style={{ transition: 'stroke 200ms' }} />
                {active && !reduce && <path d={d} fill="none" stroke="#0071E3" strokeWidth="1.5" strokeDasharray="2 10" className="animate-dash" opacity="0.9" />}
                <circle
                  cx={vertical ? b.x + W / 2 + pad : b.x + pad}
                  cy={vertical ? b.y + pad : b.y + H / 2 + pad}
                  r="2.5"
                  fill={active ? '#0071E3' : '#C7C7CC'}
                />
              </g>
            )
          })}
        </svg>
        {stages.map((s, i) => {
          const p = pos.get(s.id)!
          const k = KIND[s.kind]
          const selected = selectedId === s.id
          const related = focus && focus !== s.id && (preds.get(focus)?.includes(s.id) || stages.find((x) => x.id === focus)?.next.includes(s.id))
          const ruleCount = rulesForStage(definition, s).length
          const action = s.action ? definition.actions.find((a) => a.id === s.action) : undefined
          const hasIssue = stageIssues.has(s.id)
          return (
            <motion.button
              key={s.id}
              ref={(el) => {
                if (el) nodeRefs.current.set(s.id, el)
                else nodeRefs.current.delete(s.id)
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => onKey(e, s)}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.id)}
              onBlur={() => setHover(null)}
              aria-pressed={selected}
              aria-label={`${k.label}: ${s.label}${ruleCount ? `, ${ruleCount} rules` : ''}${hasIssue ? ', has a validation issue' : ''}`}
              className={cn(
                'absolute flex flex-col justify-between rounded-xl border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow] duration-200',
                selected
                  ? 'border-accent bg-[#F2F7FE] shadow-[0_0_0_3px_rgba(0,113,227,0.12)]'
                  : related
                    ? 'border-accent/40 bg-ink-850'
                    : 'border-line bg-ink-900 hover:border-fg-subtle/60',
                hasIssue && !selected && 'border-error/60',
              )}
              style={{ left: p.x + pad, top: p.y + pad, width: W, height: H }}
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: k.color }}>
                  <k.icon className="size-3" aria-hidden />
                  {k.label}
                </span>
                {hasIssue ? (
                  <AlertCircle className="size-3.5 text-error" aria-hidden />
                ) : ruleCount ? (
                  <span className="rounded-full bg-ink-700 px-1.5 font-mono text-[9.5px] text-fg-muted">{ruleCount} rule{ruleCount > 1 ? 's' : ''}</span>
                ) : null}
              </span>
              <span className="truncate text-[13.5px] font-medium leading-tight text-fg">{s.label}</span>
              <span className="truncate font-mono text-[10px] text-fg-subtle">
                {action ? `${action.kind} · ${action.entity}` : s.entity ? `${s.entity}${s.state ? ` · ${s.state}` : ''}` : '—'}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
