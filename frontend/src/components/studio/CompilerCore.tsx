import { motion, useReducedMotion } from 'motion/react'
import { cn } from '../../lib/cn'

export const CORE_LAYERS = ['Input', 'Interpretation', 'Logic', 'Execution'] as const

type LayerState = 'idle' | 'active' | 'done' | 'failed'

/**
 * Signature element: the transformation engine as four planes — Input → Interpretation → Logic →
 * Execution. It does not animate on its own schedule: callers derive `layers` from real job state.
 */
export function CompilerCore({ layers, className, label }: { layers: LayerState[]; className?: string; label?: string }) {
  const reduce = useReducedMotion()
  const W = 120
  const gap = 66
  const xs = CORE_LAYERS.map((_, i) => 24 + i * (W + gap))

  const tone = (s: LayerState) =>
    s === 'active' ? '#C5F477' : s === 'done' ? '#8DE1B0' : s === 'failed' ? '#F18585' : '#3A4542'

  return (
    <figure className={cn('relative', className)} aria-label={label ?? 'Compiler core'}>
      <svg viewBox="0 0 780 236" className="h-auto w-full" role="img" aria-hidden={!label}>
        <defs>
          <linearGradient id="core-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1A2020" />
            <stop offset="1" stopColor="#0F1314" />
          </linearGradient>
          <linearGradient id="core-face-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1E2620" />
            <stop offset="1" stopColor="#111611" />
          </linearGradient>
        </defs>

        {/* connectors */}
        {xs.slice(0, -1).map((x, i) => {
          const from = layers[i]
          const to = layers[i + 1]
          const flowing = from === 'done' && (to === 'active' || to === 'done')
          const y1 = 110 - 20 * 1 + 10
          const x1 = x + W
          const x2 = xs[i + 1]
          return (
            <g key={`c${i}`}>
              {[0, 1, 2].map((k) => (
                <path
                  key={k}
                  d={`M${x1} ${y1 - 18 + k * 18} C ${x1 + gap / 2} ${y1 - 18 + k * 18}, ${x2 - gap / 2} ${y1 + 2 + k * 18}, ${x2} ${y1 + 2 + k * 18}`}
                  fill="none"
                  stroke={flowing ? tone(to === 'active' ? 'active' : 'done') : '#2D3633'}
                  strokeOpacity={flowing ? 0.85 : 0.7}
                  strokeWidth={1}
                  strokeDasharray={flowing && to === 'active' ? '3 5' : undefined}
                  className={flowing && to === 'active' && !reduce ? 'animate-dash' : undefined}
                />
              ))}
            </g>
          )
        })}

        {xs.map((x, i) => {
          const s = layers[i] ?? 'idle'
          const stroke = tone(s)
          const top = 34
          const h = 150
          const skew = 20
          const points = `${x},${top + skew} ${x + W},${top} ${x + W},${top + h} ${x},${top + h + skew}`
          return (
            <g key={i}>
              <motion.polygon
                points={points}
                fill={s === 'active' ? 'url(#core-face-active)' : 'url(#core-face)'}
                stroke={stroke}
                strokeOpacity={s === 'idle' ? 1 : 0.9}
                strokeWidth={1}
                initial={false}
                animate={{ opacity: s === 'idle' ? 0.75 : 1 }}
                transition={{ duration: 0.4 }}
              />
              {/* glyph layer, drawn in the slab's skewed plane */}
              <g transform={`matrix(1 ${-skew / W} 0 1 ${x} ${top + skew})`} opacity={s === 'idle' ? 0.45 : 1}>
                <Glyph index={i} color={s === 'idle' ? '#56625E' : stroke} active={s === 'active' && !reduce} />
              </g>
              <text x={x} y={top + h + skew + 26} fill={s === 'idle' ? '#7B8783' : stroke} fontFamily="IBM Plex Mono" fontSize="10.5" letterSpacing="1.2">
                {String(i + 1).padStart(2, '0')} {CORE_LAYERS[i].toUpperCase()}
              </text>
              {s === 'active' && !reduce && (
                <motion.rect
                  x={x - 1}
                  width={W + 2}
                  height={2}
                  fill="#C5F477"
                  initial={{ y: top + 4, opacity: 0 }}
                  animate={{ y: [top + 8, top + h + 6], opacity: [0, 0.9, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ transform: `skewY(${-Math.atan(skew / W) * (180 / Math.PI)}deg)`, transformOrigin: `${x}px ${top}px` }}
                />
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

function Glyph({ index, color, active }: { index: number; color: string; active: boolean }) {
  const c = color
  if (index === 0)
    return (
      <g fill="none" stroke={c} strokeWidth="1">
        {[0, 1, 2].map((k) => (
          <g key={k} transform={`translate(${16 + k * 6} ${14 + k * 16})`}>
            <rect width="76" height="44" rx="3" fill="#0B0E0F" />
            {[0, 1, 2, 3, 4, 5].map((d) => (
              <rect key={d} x={6 + d * 12} y={3} width="5" height="3" fill={c} stroke="none" opacity="0.5" />
            ))}
          </g>
        ))}
        <polyline
          points="12,128 22,120 30,132 40,112 48,130 58,118 66,126 76,108 86,130 96,122 106,126"
          strokeOpacity="0.9"
        >
          {active && <animate attributeName="stroke-opacity" values="0.3;1;0.3" dur="1.4s" repeatCount="indefinite" />}
        </polyline>
      </g>
    )
  if (index === 1)
    return (
      <g fill="none" stroke={c} strokeWidth="1">
        <rect x="12" y="14" width="96" height="64" rx="3" fill="#0B0E0F" strokeOpacity="0.5" />
        {[
          [20, 24, 30, 24],
          [62, 30, 36, 38],
          [28, 54, 24, 18],
        ].map(([x, y, w, h], k) => (
          <g key={k}>
            <path d={`M${x} ${y + 6}V${y}h6 M${x + w - 6} ${y}h6v6 M${x + w} ${y + h - 6}v6h-6 M${x + 6} ${y + h}h-6v-6`} strokeWidth="1.2" />
            {active && <rect x={x} y={y} width={w} height={h} fill={c} fillOpacity="0.08" stroke="none" />}
          </g>
        ))}
        {[0, 1, 2].map((k) => (
          <g key={k} transform={`translate(12 ${92 + k * 15})`}>
            <rect width={[46, 62, 38][k]} height="9" rx="4.5" fill={c} fillOpacity="0.12" />
            <rect x={[52, 68, 44][k]} width="22" height="9" rx="4.5" strokeOpacity="0.6" />
          </g>
        ))}
      </g>
    )
  if (index === 2)
    return (
      <g fill="none" stroke={c} strokeWidth="1">
        <path d="M30 24 L30 58 L60 76 L90 58 M60 76 L60 112 M30 58 L90 58" strokeOpacity="0.55" />
        {[
          [30, 24],
          [30, 58],
          [90, 58],
          [60, 112],
        ].map(([x, y], k) => (
          <circle key={k} cx={x} cy={y} r="6" fill="#0B0E0F" />
        ))}
        <path d="M60 66 L70 76 L60 86 L50 76 Z" fill="#0B0E0F" />
        <circle cx="30" cy="24" r="2.5" fill={c} stroke="none" />
        {active && (
          <circle r="2.5" fill={c} stroke="none">
            <animateMotion dur="2s" repeatCount="indefinite" path="M30 24 L30 58 L60 76 L60 112" />
          </circle>
        )}
        <rect x="12" y="126" width="96" height="10" rx="2" strokeOpacity="0.4" />
      </g>
    )
  return (
    <g fill="none" stroke={c} strokeWidth="1">
      <rect x="10" y="12" width="100" height="120" rx="5" fill="#0B0E0F" />
      <line x1="10" y1="26" x2="110" y2="26" strokeOpacity="0.5" />
      {[0, 1, 2].map((k) => (
        <circle key={k} cx={18 + k * 7} cy="19" r="2" fill={c} fillOpacity="0.5" stroke="none" />
      ))}
      <rect x="10" y="26" width="22" height="106" fill={c} fillOpacity="0.06" stroke="none" />
      {[0, 1, 2, 3].map((k) => (
        <g key={k} transform={`translate(38 ${36 + k * 18})`}>
          <rect width="64" height="12" rx="2" strokeOpacity="0.45" />
          <rect x="46" y="3" width="14" height="6" rx="3" fill={c} fillOpacity={k === 1 && active ? 0.9 : 0.35} stroke="none" />
        </g>
      ))}
      <rect x="38" y="112" width="34" height="12" rx="6" fill={c} fillOpacity="0.85" stroke="none" />
    </g>
  )
}

/** Map an analysis job's stage list onto the four core layers. */
export function analysisLayers(stages: { key: string; status: string }[] | undefined): LayerState[] {
  if (!stages) return ['idle', 'idle', 'idle', 'idle']
  const groups: string[][] = [
    ['media_received', 'audio_extraction', 'frame_sampling'],
    ['transcription', 'model_interpretation'],
    ['validation'],
    [],
  ]
  // Failures in these stages stop the job; others are tolerated (the pipeline continues without them).
  const critical = new Set(['media_received', 'model_interpretation', 'validation'])
  return groups.map((keys) => {
    const ss = stages.filter((s) => keys.includes(s.key))
    if (!ss.length) return 'idle'
    if (ss.some((s) => s.status === 'failed' && critical.has(s.key))) return 'failed'
    if (ss.some((s) => s.status === 'running')) return 'active'
    if (ss.every((s) => ['done', 'skipped', 'failed'].includes(s.status))) return 'done'
    if (ss.some((s) => s.status !== 'pending')) return 'active'
    return 'idle'
  })
}

/** Map a compile job's stages onto the core layers. */
export function compileLayers(stages: { key: string; status: string }[] | undefined): LayerState[] {
  if (!stages) return ['done', 'done', 'idle', 'idle']
  const st = (k: string) => stages.find((s) => s.key === k)?.status ?? 'pending'
  const logic = ['validate_schema', 'build_models', 'prepare_forms', 'wire_transitions'].map(st)
  const exec = ['activate_runtime', 'ready'].map(st)
  const fold = (xs: string[]): LayerState =>
    xs.includes('failed') ? 'failed' : xs.every((x) => x === 'done') ? 'done' : xs.some((x) => x === 'running' || x === 'done') ? 'active' : 'idle'
  const l = fold(logic)
  const e = fold(exec)
  return ['done', 'done', l, e === 'done' ? 'done' : e]
}
