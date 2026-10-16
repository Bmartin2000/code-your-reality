import { Fragment, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowRight, ArrowUpRight, Check, Eye, FileText, Menu, Mic, Sparkles, X } from 'lucide-react'
import { HeroVisual } from '../components/landing/HeroVisual'
import { MiniRentalApp } from '../components/landing/MiniRentalApp'
import { BrandMark, TechnicalLabel } from '../components/ui/primitives'
import { ButtonLink } from '../components/ui/Button'
import { cn } from '../lib/cn'

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

function Nav() {
  const [open, setOpen] = useState(false)
  const links = [
    ['#how', 'How it works'],
    ['#generated', 'Live demo'],
    ['#operations', 'Capabilities'],
  ]
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto mt-3 flex h-14 max-w-[1440px] items-center justify-between rounded-full border border-line-soft bg-ink-950/75 px-3 backdrop-blur-md sm:mx-4 sm:px-4 xl:mx-auto">
        <Link to="/" aria-label="Reality Compiler home" className="pl-1">
          <BrandMark />
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="text-[13.5px] text-fg-muted transition-colors hover:text-fg">
              {label}
            </a>
          ))}
          <Link to="/studio" className="text-[13.5px] text-fg-muted transition-colors hover:text-fg">
            Studio
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink to="/studio" variant="primary" size="sm" className="hidden sm:inline-flex" iconRight={<ArrowRight className="size-3.5" />}>
            Launch the Studio
          </ButtonLink>
          <button className="inline-flex size-9 items-center justify-center rounded-full text-fg-muted md:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {open && (
        <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="surface-raised mx-4 mt-2 rounded-2xl p-2 md:hidden" aria-label="Primary">
          {[...links, ['/studio', 'Open the Studio']].map(([href, label]) =>
            href.startsWith('#') ? (
              <a key={href} href={href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-[15px] text-fg-muted hover:bg-ink-700 hover:text-fg">
                {label}
              </a>
            ) : (
              <Link key={href} to={href} className="block rounded-xl px-4 py-3 text-[15px] text-fg hover:bg-ink-700">
                {label}
              </Link>
            ),
          )}
        </motion.nav>
      )}
    </header>
  )
}

function Hero() {
  const reduce = useReducedMotion()
  const words = ['The', 'world', 'is', 'your']
  return (
    <section className="relative overflow-hidden pt-32 sm:pt-36 lg:min-h-[100dvh] lg:pt-40" aria-labelledby="hero-title">
      {/* restrained atmosphere: one cool key light, a fine grid fading out */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(242,243,238,0.07),transparent)]" />
        <div className="grid-paper absolute inset-0 opacity-[0.18] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      </div>
      <div className="relative mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-9">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
              <TechnicalLabel tone="muted" className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent" /> Introducing Reality Compiler
              </TechnicalLabel>
            </motion.div>
            <h1 id="hero-title" className="display mt-6 text-display-xl text-fg">
              {words.map((w, i) => (
                <Fragment key={w}>
                  <motion.span className="inline-block" initial={reduce ? false : { opacity: 0, y: '0.35em' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.08 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}>
                    {w}
                  </motion.span>{' '}
                </Fragment>
              ))}
              <br className="hidden sm:block" />
              <motion.span className="serif-accent inline-block pr-2 text-accent" initial={reduce ? false : { opacity: 0, y: '0.35em' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}>
                specification.
              </motion.span>
            </h1>
          </div>
          <motion.div className="lg:col-span-3 lg:pb-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
            <p className="text-[17px] leading-relaxed text-fg-muted">Show how work happens. Watch intelligence turn it into software.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <ButtonLink to="/studio" variant="primary" size="lg" iconRight={<ArrowRight className="size-4" />}>
                Launch the Studio
              </ButtonLink>
              <ButtonLink to="/demo" variant="secondary" size="lg">
                Experience the Demo
              </ButtonLink>
            </div>
          </motion.div>
        </div>
        <motion.div className="mt-16 lg:mt-20" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <HeroVisual />
        </motion.div>
        <p className="meta mt-6 pb-16 text-center sm:text-left">Observe → Understand → Compile → Operate</p>
      </div>
    </section>
  )
}

function OldWay() {
  const steps = [
    ['Requirements', 'Interviews, workshops, notes'],
    ['Specifications', 'Documents that describe the work'],
    ['Development', 'Translating documents into code'],
    ['Deployment', 'Finding out what was lost'],
  ]
  return (
    <section className="border-t border-line-soft py-28 lg:py-40" aria-labelledby="old-way">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <TechnicalLabel>A · The old way</TechnicalLabel>
            <h2 id="old-way" className="display mt-5 text-display-lg text-fg">
              Software used to begin with a <span className="serif-accent text-fg-muted">document.</span>
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-fg-muted">
              The people who know the work best describe it to people who don't. Every translation loses something — the exception at the counter, the rule nobody wrote down.
            </p>
          </Reveal>
          <div className="lg:col-span-6 lg:col-start-7">
            <ol className="relative">
              {steps.map(([t, d], i) => (
                <Reveal key={t} delay={i * 0.08}>
                  <li className="group grid grid-cols-[48px_1fr] items-start gap-4 border-b border-line-soft py-6 last:border-0">
                    <span className="font-mono text-[12px] text-fg-subtle">{String(i + 1).padStart(2, '0')}</span>
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <p className="text-[22px] font-medium tracking-[-0.02em] text-fg-muted">{t}</p>
                        <p className="mt-1 text-[14px] text-fg-subtle">{d}</p>
                      </div>
                      <FileText className="mt-1.5 size-5 shrink-0 text-ink-700" aria-hidden />
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

function NewWay() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [stage, setStage] = useState(reduce ? 2 : 0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => !reduce && setStage(v < 0.33 ? 0 : v < 0.66 ? 1 : 2))
  const line = useTransform(scrollYProgress, [0.05, 0.9], ['0%', '100%'])
  const items = [
    { k: 'Video', title: 'A moment of real work', body: 'Ninety seconds at a rental counter: an item chosen, a board checked, a slip filled, a tag flipped.', icon: Eye },
    { k: 'Understanding', title: 'Structure, with receipts', body: 'Entities, states and rules — each linked to the second it was seen or said, each waiting for a human to confirm.', icon: Sparkles },
    { k: 'Application', title: 'Software that enforces it', body: 'Forms, records and a state machine that refuse to rent an item twice. Because the counter never would.', icon: Check },
  ]
  return (
    <section ref={ref} className="relative border-t border-line-soft lg:h-[260vh]" aria-labelledby="new-way">
      <div className="lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:items-center">
        <div className="mx-auto w-full max-w-[1440px] px-5 py-28 sm:px-8 lg:px-12 lg:py-0">
          <TechnicalLabel>B · The new way</TechnicalLabel>
          <h2 id="new-way" className="display mt-5 max-w-4xl text-display-lg text-fg">
            Now it can begin with a <span className="serif-accent text-accent">moment.</span>
          </h2>
          <div className="relative mt-16">
            <div className="absolute left-0 right-0 top-[22px] hidden h-px bg-line lg:block" aria-hidden>
              <motion.div className="h-full bg-accent" style={{ width: reduce ? '100%' : line }} />
            </div>
            <ol className="grid gap-10 lg:grid-cols-3 lg:gap-8">
              {items.map((it, i) => {
                const active = stage >= i
                return (
                  <li key={it.k} className="relative">
                    <span className={cn('relative z-10 flex size-11 items-center justify-center rounded-full border bg-ink-950 transition-colors duration-500', active ? 'border-accent text-accent' : 'border-line text-fg-subtle')}>
                      <it.icon className="size-4" />
                    </span>
                    <TechnicalLabel className={cn('mt-6 block transition-colors duration-500', active && 'text-accent')}>
                      {String(i + 1).padStart(2, '0')} · {it.k}
                    </TechnicalLabel>
                    <p className={cn('mt-3 text-[26px] font-medium leading-tight tracking-[-0.025em] transition-colors duration-500', active ? 'text-fg' : 'text-fg-subtle')}>{it.title}</p>
                    <p className={cn('mt-3 max-w-sm text-[15px] leading-relaxed transition-colors duration-500', active ? 'text-fg-muted' : 'text-fg-subtle/70')}>{it.body}</p>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

function StageObserve() {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={cn('aspect-video rounded border', i === 2 ? 'border-accent/60 bg-accent/[0.06]' : 'border-line-soft bg-ink-950')} />
        ))}
      </div>
      <svg viewBox="0 0 300 40" className="mt-4 h-10 w-full" aria-hidden>
        {Array.from({ length: 60 }).map((_, i) => {
          const h = 4 + Math.abs(Math.sin(i * 0.7) * 14 + Math.sin(i * 0.23) * 10)
          return <rect key={i} x={i * 5} y={20 - h / 2} width="2.2" height={h} rx="1" fill={i > 18 && i < 28 ? '#C5F477' : '#3A4542'} />
        })}
      </svg>
      <div className="mt-3 flex items-center justify-between font-mono text-[10.5px] text-fg-subtle">
        <span className="inline-flex items-center gap-1.5"><Mic className="size-3" /> faster-whisper</span>
        <span>6 frames · 00:00–01:00</span>
      </div>
    </div>
  )
}

function StageUnderstand() {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="surface rounded-2xl p-5">
      <TechnicalLabel>Detected rule</TechnicalLabel>
      <p className="mt-2 text-[16px] leading-snug text-fg">An item becomes unavailable after rental activation.</p>
      <div className="mt-4 rounded-xl border border-line-soft bg-ink-950 p-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent">Evidence · narration 00:14–00:22</span>
        <p className="mt-1.5 text-[13px] text-fg-muted">“Once that's done I flip the tag on the board to ‘rented’ so nobody else takes it.”</p>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors', confirmed ? 'text-success' : 'text-warning')}>{confirmed ? 'Review · human confirmed' : 'Review · awaiting confirmation'}</span>
        <button onClick={() => setConfirmed(!confirmed)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors', confirmed ? 'border-success/40 bg-success/10 text-success' : 'border-line text-fg-muted hover:text-fg')}>
          <Check className="size-3.5" /> {confirmed ? 'Confirmed' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}

function StageOperate() {
  const [state, setState] = useState<'active' | 'returned'>('active')
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <TechnicalLabel>RNT-0007 · state machine</TechnicalLabel>
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', state === 'active' ? 'border-accent/40 text-accent' : 'border-success/40 text-success')}>{state}</span>
      </div>
      <div className="mt-5 flex items-center gap-3">
        {['active', 'returned'].map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-3">
            <div className={cn('flex-1 rounded-xl border px-3 py-3 text-center font-mono text-[12px] transition-colors duration-500', state === s ? 'border-accent/60 bg-accent/[0.06] text-fg' : 'border-line-soft text-fg-subtle')}>{s}</div>
            {i === 0 && <ArrowRight className="size-4 text-fg-subtle" />}
          </div>
        ))}
      </div>
      <button
        onClick={() => setState(state === 'active' ? 'returned' : 'active')}
        className="mt-4 h-9 w-full rounded-full border border-line text-[13px] text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
      >
        {state === 'active' ? 'Complete return' : 'Reset example'}
      </button>
    </div>
  )
}

function HowItWorks() {
  const stages = [
    { n: '01', t: 'Observe', q: 'Capture the process as it happens.', body: 'Record a camera or screen, or upload a clip. Audio is transcribed locally; a bounded set of frames is sampled for the model.', v: <StageObserve /> },
    { n: '02', t: 'Understand', q: 'AI discovers the structure hiding inside everyday work.', body: 'A local open-weight model proposes entities, states and rules — each one traceable to its evidence, none of them trusted until you confirm.', v: <StageUnderstand /> },
    { n: '03', t: 'Operate', q: 'Turn approved logic into working software.', body: 'The approved definition compiles into a manifest that a predefined runtime executes. No generated code is ever run.', v: <StageOperate /> },
  ]
  return (
    <section id="how" className="scroll-mt-24 border-t border-line-soft py-28 lg:py-40" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <Reveal>
          <TechnicalLabel>C · How it works</TechnicalLabel>
          <h2 id="how-title" className="sr-only">
            How it works
          </h2>
        </Reveal>
        <div className="mt-10 space-y-24 lg:space-y-36">
          {stages.map((s, i) => (
            <div key={s.n} className="grid items-center gap-10 lg:grid-cols-12">
              <Reveal className={cn('lg:col-span-6', i % 2 === 1 && 'lg:order-2 lg:col-start-7')}>
                <div className="flex items-baseline gap-5">
                  <span className="font-mono text-[13px] text-accent">{s.n}</span>
                  <span className="display text-[clamp(3rem,7vw,6.5rem)] leading-none text-fg">{s.t}</span>
                </div>
                <p className="serif-accent mt-6 max-w-lg text-[clamp(1.5rem,2.2vw,2rem)] leading-tight text-fg-muted">{s.q}</p>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-muted">{s.body}</p>
              </Reveal>
              <Reveal delay={0.1} className={cn('lg:col-span-5', i % 2 ? 'lg:order-1 lg:col-start-1' : 'lg:col-start-8')}>
                {s.v}
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Generated() {
  return (
    <section id="generated" className="scroll-mt-24 border-t border-line-soft py-28 lg:py-40" aria-labelledby="gen-title">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <Reveal className="max-w-3xl">
          <TechnicalLabel>D · Real application generation</TechnicalLabel>
          <h2 id="gen-title" className="display mt-5 text-display-md text-fg">
            A paper slip on Monday. <span className="serif-accent text-fg-muted">A rental system by lunch.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <TechnicalLabel className="mb-3 block">Before · manual intake</TechnicalLabel>
            <div className="relative rotate-[-1.2deg] rounded-md border border-line bg-[#15191a] p-5 font-mono text-[12px] text-fg-muted shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
              <p className="tracking-[0.12em] text-fg-subtle">RENTAL SLIP Nº 0412</p>
              <dl className="mt-4 space-y-2.5">
                {[
                  ['Item', 'Canon R6 body'],
                  ['Customer', 'L. Hoffmann'],
                  ['Start', '14 / 10'],
                  ['Return', '17 / 10'],
                  ['Deposit', '250,—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-dashed border-line pb-1.5">
                    <dt className="text-fg-subtle">{k}</dt>
                    <dd className="italic text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[11px] text-fg-subtle">☐ returned · ☐ deposit back · tag flipped?</p>
            </div>
            <p className="mt-6 text-[14px] leading-relaxed text-fg-muted">Availability lives on a wall board. Double bookings are caught by memory, if at all.</p>
          </Reveal>
          <Reveal delay={0.1} className="lg:col-span-8">
            <div className="mb-3 flex items-center justify-between">
              <TechnicalLabel>After · compiled application</TechnicalLabel>
              <TechnicalLabel>In-page preview · same rules, in-memory data</TechnicalLabel>
            </div>
            <MiniRentalApp />
            <p className="mt-4 text-[13px] leading-relaxed text-fg-subtle">
              This preview runs the compiled rental rules in your browser. In the Studio, the same rules are enforced by the server and every record persists.{' '}
              <Link to="/demo" className="text-fg underline-offset-4 hover:underline">
                Compile it yourself
              </Link>
              .
            </p>
          </Reveal>
        </div>
        <Reveal className="mt-24 text-center">
          <p className="display mx-auto max-w-4xl text-[clamp(1.8rem,3.4vw,3rem)] leading-[1.1] text-fg">
            We didn't start with a specification. <span className="serif-accent text-accent">We started with reality.</span>
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function Operations() {
  const caps = [
    ['Structured data extraction', 'Entities, typed fields and references proposed from frames, speech and narration.', 'JSON-schema constrained output'],
    ['Human-verified business rules', 'Nothing is compiled until a person confirms it. Rejections are excluded, edits are versioned.', 'Review status per item'],
    ['Workflow state machines', 'Lifecycles with guarded transitions. Invalid moves are refused by the server.', 'HTTP 409 on violation'],
    ['Generated forms', 'Create and edit forms derived from the data model, with client and server validation.', 'Zod + Pydantic'],
    ['Persistent operational records', 'Items, customers and rentals survive refreshes and restarts, with a full activity history.', 'SQLite · SQLAlchemy'],
    ['Traceable source evidence', 'Every rule links to the transcript second or frame it came from, plus an audit trail of decisions.', 'Provenance on every finding'],
  ]
  return (
    <section id="operations" className="scroll-mt-24 border-t border-line-soft py-28 lg:py-40" aria-labelledby="ops-title">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <TechnicalLabel>E · Built for real operations</TechnicalLabel>
            <h2 id="ops-title" className="display mt-5 text-display-md text-fg">
              Not a flowchart. <span className="serif-accent text-fg-muted">A system that runs.</span>
            </h2>
          </Reveal>
          <ol className="lg:col-span-7 lg:col-start-6">
            {caps.map(([t, d, m], i) => (
              <Reveal key={t} delay={i * 0.04}>
                <li className="grid gap-2 border-b border-line-soft py-6 sm:grid-cols-[44px_1fr_auto] sm:items-baseline sm:gap-6">
                  <span className="font-mono text-[12px] text-fg-subtle">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <p className="text-[19px] font-medium tracking-[-0.02em] text-fg">{t}</p>
                    <p className="mt-1.5 max-w-lg text-[14.5px] leading-relaxed text-fg-muted">{d}</p>
                  </div>
                  <span className="meta sm:text-right">{m}</span>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-line-soft py-32 lg:py-48" aria-labelledby="cta-title">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[420px] bg-[radial-gradient(ellipse_at_bottom,rgba(197,244,119,0.07),transparent_65%)]" aria-hidden />
      <div className="relative mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <Reveal>
          <TechnicalLabel>F · Begin</TechnicalLabel>
          <h2 id="cta-title" className="display mt-6 text-display-xl text-fg">
            The next application begins in the <span className="serif-accent text-accent">real world.</span>
          </h2>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <ButtonLink to="/studio/new" variant="primary" size="lg" iconRight={<ArrowRight className="size-4" />}>
              Compile your first workflow
            </ButtonLink>
            <ButtonLink to="/demo" size="lg" variant="ghost" iconRight={<ArrowUpRight className="size-4" />}>
              Or try the guided sample
            </ButtonLink>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line-soft">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-12 lg:px-12">
        <div className="md:col-span-5">
          <BrandMark />
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-fg-muted">From reality to runnable software. Observed processes, human-verified logic, a safe schema-driven runtime.</p>
        </div>
        <nav className="grid grid-cols-2 gap-8 md:col-span-4" aria-label="Footer">
          <div className="space-y-2.5">
            <TechnicalLabel className="block">Product</TechnicalLabel>
            <Link to="/studio" className="block text-[14px] text-fg-muted hover:text-fg">Studio</Link>
            <Link to="/demo" className="block text-[14px] text-fg-muted hover:text-fg">Guided sample</Link>
            <Link to="/studio/new" className="block text-[14px] text-fg-muted hover:text-fg">New compilation</Link>
          </div>
          <div className="space-y-2.5">
            <TechnicalLabel className="block">Explore</TechnicalLabel>
            <a href="#how" className="block text-[14px] text-fg-muted hover:text-fg">How it works</a>
            <a href="#generated" className="block text-[14px] text-fg-muted hover:text-fg">Live preview</a>
            <Link to="/studio/settings" className="block text-[14px] text-fg-muted hover:text-fg">Engine status</Link>
          </div>
        </nav>
        <div className="md:col-span-3">
          <TechnicalLabel className="block">Stack</TechnicalLabel>
          <p className="mt-2.5 text-[13px] leading-relaxed text-fg-subtle">React · FastAPI · SQLite · FFmpeg · faster-whisper · Ollama-compatible open-weight models. Runs locally.</p>
        </div>
      </div>
      <div className="border-t border-line-soft">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-6 sm:flex-row sm:justify-between sm:px-8 lg:px-12">
          <TechnicalLabel>Reality Compiler · v1.0</TechnicalLabel>
          <TechnicalLabel>Don't describe your workflow. Show it.</TechnicalLabel>
        </div>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="bg-ink-950">
      <Nav />
      <main id="main">
        <Hero />
        <OldWay />
        <NewWay />
        <HowItWorks />
        <Generated />
        <Operations />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
