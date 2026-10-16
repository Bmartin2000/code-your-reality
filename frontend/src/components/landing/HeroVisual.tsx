import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { cn } from '../../lib/cn'

const CYCLE = 11 // seconds

/** A deterministic timeline 0..1 that loops; frozen at the final state for reduced motion. */
function useCycle(paused: boolean) {
  const reduce = useReducedMotion()
  const [t, setT] = useState(reduce ? 1 : 0)
  const start = useRef<number | null>(null)
  useAnimationFrame((time) => {
    if (reduce || paused) return
    if (start.current == null) start.current = time
    const next = (((time - start.current) / 1000) % CYCLE) / CYCLE
    // Quantized (~27 updates/s): this drives discrete reveals, not per-frame transforms.
    const q = Math.round(next * 300) / 300
    setT((prev) => (prev === q ? prev : q))
  })
  return reduce ? 1 : t
}

const on = (t: number, at: number) => t >= at

function Appear({ show, children, className, delay = 0 }: { show: boolean; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={false} animate={{ opacity: show ? 1 : 0, y: show ? 0 : 6, filter: show ? 'blur(0px)' : 'blur(2px)' }} transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

function CounterScene({ t }: { t: number }) {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <rect width="320" height="180" fill="#0B0E0F" />
      {/* soft key light */}
      <radialGradient id="hv-light" cx="0.3" cy="0.2" r="0.9">
        <stop offset="0" stopColor="#F2F3EE" stopOpacity="0.08" />
        <stop offset="1" stopColor="#F2F3EE" stopOpacity="0" />
      </radialGradient>
      <rect width="320" height="180" fill="url(#hv-light)" />
      <g stroke="#56625E" strokeWidth="1" fill="none">
        <line x1="20" y1="70" x2="170" y2="70" />
        <line x1="20" y1="120" x2="170" y2="120" />
        <rect x="34" y="44" width="40" height="26" rx="3" />
        <circle cx="54" cy="57" r="8" />
        <rect x="92" y="96" width="18" height="24" rx="2" />
        <rect x="124" y="48" width="36" height="22" rx="2" />
        {/* board */}
        <rect x="196" y="30" width="104" height="96" rx="4" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line x1="206" x2="248" y1={50 + i * 20} y2={50 + i * 20} />
            <rect x="256" y={44 + i * 20} width="34" height="11" rx="2" stroke={i === 0 ? (on(t, 0.5) ? '#C5F477' : '#8DE1B0') : '#3A4542'} />
          </g>
        ))}
        {/* counter */}
        <line x1="0" y1="150" x2="320" y2="150" stroke="#2D3633" />
        <rect x="120" y="134" width="70" height="16" rx="2" />
      </g>
      <text x="262" y="53" fontFamily="IBM Plex Mono" fontSize="6.5" fill={on(t, 0.5) ? '#C5F477' : '#8DE1B0'}>
        {on(t, 0.5) ? 'RENTED' : 'AVAIL.'}
      </text>
      {/* detection brackets */}
      {[
        { x: 28, y: 38, w: 52, h: 38, label: 'ITEM', at: 0.06 },
        { x: 190, y: 24, w: 116, h: 108, label: 'AVAILABILITY', at: 0.13 },
        { x: 114, y: 128, w: 82, h: 28, label: 'RENTAL SLIP', at: 0.2 },
      ].map((b) =>
        on(t, b.at) ? (
          <g key={b.label} stroke="#C5F477" strokeWidth="1.2" fill="none">
            <path d={`M${b.x} ${b.y + 7}V${b.y}h7 M${b.x + b.w - 7} ${b.y}h7v7 M${b.x + b.w} ${b.y + b.h - 7}v7h-7 M${b.x + 7} ${b.y + b.h}h-7v-7`} />
            <text x={b.x} y={b.y - 4} fontFamily="IBM Plex Mono" fontSize="6.5" fill="#C5F477" stroke="none" letterSpacing="0.6">
              {b.label}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  )
}

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const t = useCycle(!visible)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 60, damping: 18 })
  const sy = useSpring(my, { stiffness: 60, damping: 18 })
  const leftX = useTransform(sx, (v) => v * -8)
  const rightX = useTransform(sx, (v) => v * 8)
  const tiltY = useTransform(sy, (v) => v * -4)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const seconds = Math.min(t * 60, 59)
  const transcript = on(t, 0.1) ? (on(t, 0.42) ? "Then I flip the tag to 'rented' so nobody else takes it." : "If it's marked available, we can rent it.") : 'Okay, so this is how a rental works…'
  const phase = t < 0.3 ? 0 : t < 0.55 ? 1 : t < 0.75 ? 2 : 3

  return (
    <div
      ref={ref}
      className="relative"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width - 0.5)
        my.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onPointerLeave={() => {
        mx.set(0)
        my.set(0)
      }}
      aria-label="Illustration: a recorded rental counter is analyzed into entities and rules, which assemble into a working rental application."
      role="img"
    >
      <div className="relative grid gap-4 lg:grid-cols-[1.05fr_0.9fr_1.05fr] lg:gap-0">
        {/* connective tissue */}
        <svg className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
          {[34, 50, 66].map((y, i) => (
            <path key={i} d={`M35 ${y} C 40 ${y}, 38 ${50 + (y - 50) * 0.4}, 43 ${50 + (y - 50) * 0.4}`} stroke={phase >= 1 ? '#C5F477' : '#2D3633'} strokeOpacity={phase >= 1 ? 0.55 : 1} strokeWidth="0.15" fill="none" strokeDasharray="0.6 0.9" className={phase === 1 ? 'animate-dash' : undefined} vectorEffect="non-scaling-stroke" />
          ))}
          {[42, 50, 58].map((y, i) => (
            <path key={i} d={`M57 ${y} C 62 ${y}, 60 ${50 + (y - 50) * 2}, 65 ${50 + (y - 50) * 2}`} stroke={phase >= 2 ? '#C5F477' : '#2D3633'} strokeOpacity={phase >= 2 ? 0.55 : 1} strokeWidth="0.15" fill="none" strokeDasharray="0.6 0.9" className={phase === 2 ? 'animate-dash' : undefined} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>

        {/* 01 · reality */}
        <motion.div style={{ x: leftX, y: tiltY }} className="relative lg:pr-10">
          <div className="meta mb-3 flex items-center justify-between">
            <span>01 · Observed reality</span>
            <span className="flex items-center gap-1.5 text-error">
              <span className="size-1.5 animate-soft-pulse rounded-full bg-error" /> REC 00:{String(Math.floor(seconds)).padStart(2, '0')}
            </span>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-line bg-ink-925 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="aspect-[16/9]">
              <CounterScene t={t} />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/95 to-transparent px-3 pb-2.5 pt-8">
              <p className="text-[12px] leading-snug text-fg/90">“{transcript}”</p>
            </div>
          </div>
          <div className="mt-2 flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cn('h-7 flex-1 rounded-[3px] border transition-colors duration-500', t * 6 > i ? 'border-accent/40 bg-accent/[0.06]' : 'border-line-soft bg-ink-925')} />
            ))}
          </div>
        </motion.div>

        {/* 02 · understanding */}
        <div className="relative lg:px-4">
          <div className="meta mb-3">02 · Understanding</div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {['Customer', 'Item', 'Rental', 'Deposit', 'Return'].map((e, i) => (
                <Appear key={e} show={on(t, 0.12 + i * 0.035)}>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-900 px-2.5 py-1 text-[12px] text-fg">
                    <span className="size-1.5 rounded-full" style={{ background: i < 2 ? '#9fc5e8' : '#c9b6f2' }} />
                    {e}
                  </span>
                </Appear>
              ))}
            </div>
            <Appear show={on(t, 0.3)}>
              <div className="rounded-xl border border-line bg-ink-900 p-3">
                <p className="text-[12.5px] leading-snug text-fg">An unavailable item cannot be rented.</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-accent">NARRATION 00:09–00:14</span>
                  <motion.span
                    initial={false}
                    animate={{ color: on(t, 0.48) ? '#8DE1B0' : '#FFC777', borderColor: on(t, 0.48) ? 'rgba(141,225,176,0.35)' : 'rgba(255,199,119,0.35)' }}
                    className="rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em]"
                  >
                    {on(t, 0.48) ? 'Human confirmed' : 'Needs review'}
                  </motion.span>
                </div>
              </div>
            </Appear>
            <Appear show={on(t, 0.38)}>
              <div className="rounded-xl border border-line-soft bg-ink-925 p-3">
                <p className="text-[12.5px] leading-snug text-fg-muted">Starting a rental marks the item as rented.</p>
                <span className="mt-2 block font-mono text-[10px] text-accent">NARRATION 00:33–00:39</span>
              </div>
            </Appear>
            <Appear show={on(t, 0.44)}>
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-line-soft px-3 py-2 font-mono text-[10.5px] text-fg-subtle">
                <span>active</span>
                <span className="h-px flex-1 bg-line" />
                <span className="text-fg-muted">complete_return</span>
                <span className="h-px flex-1 bg-line" />
                <span>returned</span>
              </div>
            </Appear>
          </div>
        </div>

        {/* 03 · software */}
        <motion.div style={{ x: rightX, y: tiltY }} className="relative lg:pl-10">
          <div className="meta mb-3 flex items-center justify-between">
            <span>03 · Running software</span>
            <span className={cn('transition-colors', on(t, 0.75) ? 'text-accent' : '')}>{on(t, 0.75) ? 'LIVE' : 'ASSEMBLING'}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-ink-900 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 rounded-full bg-ink-700" />
              ))}
              <span className="ml-2 font-mono text-[10px] text-fg-subtle">/apps/equipment-rental</span>
            </div>
            <div className="grid min-h-[196px] grid-cols-[64px_1fr]">
              <div className="space-y-1.5 border-r border-line-soft p-2">
                {['Overview', 'Inventory', 'Customers', 'Rentals'].map((n, i) => (
                  <Appear key={n} show={on(t, 0.56 + i * 0.02)}>
                    <div className={cn('rounded px-1.5 py-1 text-[9.5px]', i === 1 ? 'bg-ink-700 text-fg' : 'text-fg-subtle')}>{n}</div>
                  </Appear>
                ))}
              </div>
              <div className="space-y-1.5 p-2.5">
                {[
                  ['Canon EOS R6', true],
                  ['24–70mm f/2.8', false],
                  ['Aputure 300d', false],
                ].map(([name, flip], i) => (
                  <Appear key={name as string} show={on(t, 0.62 + i * 0.03)}>
                    <div className="flex items-center justify-between rounded-md border border-line-soft bg-ink-950 px-2 py-1.5">
                      <span className="text-[10.5px] text-fg">{name}</span>
                      <motion.span
                        initial={false}
                        animate={{
                          color: flip && on(t, 0.84) ? '#C5F477' : '#8DE1B0',
                          borderColor: flip && on(t, 0.84) ? 'rgba(197,244,119,0.4)' : 'rgba(141,225,176,0.3)',
                        }}
                        className="rounded-full border px-1.5 font-mono text-[8.5px] uppercase"
                      >
                        {flip && on(t, 0.84) ? 'rented' : 'available'}
                      </motion.span>
                    </div>
                  </Appear>
                ))}
                <Appear show={on(t, 0.72)}>
                  <div className="mt-2 rounded-md border border-line-soft p-2">
                    <div className="mb-1 font-mono text-[8.5px] uppercase text-fg-subtle">New rental</div>
                    <div className="grid grid-cols-2 gap-1">
                      <div className="h-4 rounded-sm border border-line-soft" />
                      <div className="h-4 rounded-sm border border-line-soft" />
                    </div>
                    <motion.div initial={false} animate={{ scale: on(t, 0.8) && !on(t, 0.84) ? 0.94 : 1 }} className="mt-1.5 h-4 w-16 rounded-full bg-accent" />
                  </div>
                </Appear>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* processing timeline */}
      <div className="mt-10">
        <div className="relative h-px bg-line">
          <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${t * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-4">
          {['Observe', 'Understand', 'Compile', 'Operate'].map((s, i) => (
            <span key={s} className={cn('meta transition-colors duration-300', phase === i ? 'text-accent' : phase > i ? 'text-fg-muted' : '')}>
              {String(i + 1).padStart(2, '0')} {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
