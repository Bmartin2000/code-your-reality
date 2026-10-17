import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  BarChart3,
  Bike,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  Hammer,
  Link2,
  Lock,
  Menu,
  MessageSquareText,
  PartyPopper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react'
import { MiniRentalApp } from '../components/landing/MiniRentalApp'
import { BrandMark } from '../components/ui/primitives'
import { ButtonLink } from '../components/ui/Button'
import { cn } from '../lib/cn'
import { COMPARISON, PLANS, SUPPORT_URL } from '../lib/plans'
import { useAiHosting } from '../lib/hosting'

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

const LINKS = [
  ['#how', 'How it works'],
  ['#features', 'Features'],
  ['#pricing', 'Pricing'],
  ['#faq', 'FAQ'],
] as const

function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-50 border-b border-line-soft/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between px-5">
        <Link to="/" aria-label="Code Your Reality home">
          <BrandMark />
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="text-[15px] text-fg-muted transition-colors hover:text-accent">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden px-3 text-[15px] text-fg-muted hover:text-accent md:block">
            Sign in
          </Link>
          <ButtonLink to="/studio/new" variant="primary" size="sm" className="hidden sm:inline-flex">
            Try it free
          </ButtonLink>
          <button className="inline-flex size-10 items-center justify-center rounded-full text-fg md:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line-soft bg-white px-5 pb-6 pt-2 md:hidden" aria-label="Primary">
          {[...LINKS, ['/login', 'Sign in'] as const].map(([href, label]) =>
            href.startsWith('#') ? (
              <a key={href} href={href} onClick={() => setOpen(false)} className="block border-b border-line-soft py-4 text-[17px]">
                {label}
              </a>
            ) : (
              <Link key={href} to={href} className="block border-b border-line-soft py-4 text-[17px]">
                {label}
              </Link>
            ),
          )}
          <ButtonLink to="/studio/new" variant="primary" size="lg" className="mt-5 w-full">
            Try it free
          </ButtonLink>
        </nav>
      )}
    </header>
  )
}

// --- Hero ---------------------------------------------------------------------------------------

function PhoneMock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative w-[230px] shrink-0 rounded-[38px] border-[7px] border-fg bg-white p-2 shadow-[0_40px_80px_-30px_rgba(11,27,38,0.45)]', className)}>
      <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-fg" aria-hidden />
      <div className="h-[420px] overflow-hidden rounded-[28px] bg-ink-900">{children}</div>
    </div>
  )
}

function Hero() {
  const hosting = useAiHosting()
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-14 sm:pt-20" aria-labelledby="hero-title">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#CCECFF,transparent)] opacity-80" />
        <div className="absolute right-[-120px] top-60 h-[380px] w-[380px] rounded-full bg-[radial-gradient(closest-side,#E8F6FF,transparent)]" />
      </div>
      <div className="mx-auto grid max-w-[1140px] items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="text-center lg:text-left">
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-[14px] font-medium text-accent">
            <Sparkles className="size-4" /> Business software from a single video
          </motion.span>
          <motion.h1
            id="hero-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="display mt-6 text-[clamp(2.4rem,5vw,3.75rem)] leading-[1.06] text-fg"
          >
            Film how you work.
            <br />
            <span className="bg-gradient-to-r from-[#00A1FF] to-[#0077BE] bg-clip-text text-transparent">Get your own app.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }} className="mx-auto mt-6 max-w-xl text-[19px] leading-relaxed text-fg-muted lg:mx-0">
            Show your daily process to your phone camera — renting, repairs, orders, bookings. Code Your Reality's AI turns it into a working app with forms, lists, rules and reports. No developers, no specification.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }} className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <ButtonLink to="/studio/new" variant="primary" size="lg" className="w-full sm:w-auto" iconRight={<ArrowRight className="size-4" />}>
              Try it free
            </ButtonLink>
            <ButtonLink to="/demo" variant="secondary" size="lg" className="w-full sm:w-auto">
              See a ready example
            </ButtonLink>
          </motion.div>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] text-fg-subtle lg:justify-start">
            {['Free demo, no card', hosting.short, 'Support by Integrint'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroDevices />
      </div>
    </section>
  )
}

function HeroDevices() {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (reduce) return setPhase(2)
    const t = window.setInterval(() => setPhase((p) => (p + 1) % 3), 2600)
    return () => window.clearInterval(t)
  }, [reduce])
  return (
    <div className="relative mx-auto flex h-[470px] w-full max-w-[460px] items-center justify-center" aria-label="A phone records a rental counter; the result is an app with an inventory list and rules." role="img">
      <PhoneMock className="absolute left-0 top-0 z-10 -rotate-6 scale-[0.92]">
        <div className="relative h-full bg-gradient-to-b from-[#0B1B26] to-[#2A3B47] p-4 text-white">
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <span className="size-2 animate-soft-pulse rounded-full bg-[#ff453a]" /> REC
          </div>
          <div className="mt-24 space-y-3">
            {['Item: camera', 'Check: available?', 'Deposit: €250'].map((t, i) => (
              <motion.div key={t} initial={false} animate={{ opacity: phase >= i ? 1 : 0.15, x: phase >= i ? 0 : -6 }} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-[12px] backdrop-blur">
                {t}
              </motion.div>
            ))}
          </div>
          <p className="absolute inset-x-4 bottom-5 text-[11px] leading-snug text-white/80">“If it’s marked available, we can rent it…”</p>
        </div>
      </PhoneMock>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.9 }} className="absolute bottom-2 right-0 z-20 w-[268px] rotate-3 rounded-3xl border border-line-soft bg-white p-4 shadow-[0_30px_70px_-30px_rgba(11,27,38,0.35)]">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-[11px] font-bold text-white">R</span>
          <span className="text-[13px] font-semibold">Rental app</span>
          <span className="ml-auto rounded-full bg-[#E6F4EE] px-2 py-0.5 text-[10px] font-medium text-success">Live</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          {[
            ['5', 'Items', 'bg-brand-50 text-accent'],
            ['2', 'Rented', 'bg-[#FBF1DC] text-warning'],
            ['3', 'Customers', 'bg-[#F0ECFF] text-[#6B4FD8]'],
          ].map(([n, l, c]) => (
            <div key={l} className={cn('rounded-xl py-2', c)}>
              <p className="font-[Poppins] text-[18px] font-semibold leading-none">{n}</p>
              <p className="mt-1 text-[10px]">{l}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-1.5">
          {[
            ['Canon EOS R6', phase === 2 ? 'Rented' : 'Available'],
            ['Sony 24–70mm', 'Available'],
            ['Aputure 300d', 'Rented'],
          ].map(([n, st]) => (
            <li key={n} className="flex items-center justify-between rounded-lg bg-ink-900 px-2.5 py-1.5 text-[12px]">
              {n}
              <motion.span layout className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', st === 'Rented' ? 'bg-[#FBF1DC] text-warning' : 'bg-[#E6F4EE] text-success')}>
                {st}
              </motion.span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11px] text-accent">
          <ShieldCheck className="size-3.5" /> Rule: an item can’t be rented twice
        </p>
      </motion.div>
    </div>
  )
}

// --- Problem / solution ---------------------------------------------------------------------------

function Contrast() {
  return (
    <section className="bg-ink-900 px-5 py-24" aria-labelledby="contrast-title">
      <div className="mx-auto max-w-[1140px]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="contrast-title" className="display text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.08]">
            Your business already has a system. It lives in your head.
          </h2>
          <p className="mt-4 text-[18px] text-fg-muted">Paper slips, whiteboards, spreadsheets and “ask Peter”. Custom software could fix it — but it usually starts with weeks of meetings and a document nobody wants to write.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <Reveal className="rounded-3xl bg-white p-8">
            <p className="text-[14px] font-semibold uppercase tracking-wide text-fg-subtle">The usual way</p>
            <ol className="mt-5 space-y-4">
              {['Explain your process in meetings', 'Someone writes a specification', 'Developers build it', 'You find out what was misunderstood', 'Pay again for every change'].map((t, i) => (
                <li key={t} className="flex items-center gap-3 text-[16px] text-fg-muted">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-850 text-[13px] font-semibold text-fg-subtle">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.08} className="rounded-3xl bg-gradient-to-br from-[#00A1FF] to-[#0077BE] p-8 text-white">
            <p className="text-[14px] font-semibold uppercase tracking-wide text-white/80">With Code Your Reality</p>
            <ol className="mt-5 space-y-4">
              {['Record the process with your phone', 'AI finds what you track and your rules', 'You keep what’s right — in plain language', 'Your app is live, with a link', 'Something changed? Record again'].map((t, i) => (
                <li key={t} className="flex items-center gap-3 text-[16px] font-medium">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-accent">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// --- Guided walkthrough ---------------------------------------------------------------------------

const JOURNEY = [
  {
    icon: Camera,
    tint: 'bg-brand-50 text-accent',
    title: 'Record',
    lead: 'Show the job once, from start to finish.',
    body: 'Open the camera and do the task as usual. Say out loud what you check and what must never happen. One or two minutes is enough.',
    screen: (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0B1B26] to-[#2A3B47] p-5 text-white">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#ff453a]/90">
          <span className="size-6 rounded-md bg-white" />
        </span>
        <p className="text-[13px]">Recording · 00:48</p>
        <p className="text-center text-[11px] text-white/70">“A tool can only be lent to one member at a time.”</p>
      </div>
    ),
  },
  {
    icon: Sparkles,
    tint: 'bg-[#F0ECFF] text-[#6B4FD8]',
    title: 'AI understands',
    lead: 'Google’s open Gemma model studies the video.',
    body: 'It listens to what you said, looks at the frames, and finds what you keep track of, the steps, and the rules. You see everything it found before anything is built.',
    screen: (
      <div className="space-y-2.5 p-4">
        {['Video received', 'Listening to what you said', 'Looking at the video', 'Understanding your process'].map((t, i) => (
          <div key={t} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[12px]">
            {i < 3 ? <Check className="size-4 text-success" /> : <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
            {t}
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: ShieldCheck,
    tint: 'bg-[#E6F4EE] text-success',
    title: 'You check',
    lead: 'Plain language, with receipts.',
    body: 'Every finding shows the sentence it came from. Keep what’s right, leave out what isn’t. Anything the AI only guessed is clearly flagged.',
    screen: (
      <div className="space-y-2 p-4">
        {[
          ['Members', true],
          ['A tool can only be lent once at a time', true],
          ['Late returns may incur a fee', false],
        ].map(([t, keep]) => (
          <div key={String(t)} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-[12px]">
            <span className={cn(!keep && 'text-fg-subtle line-through')}>{t}</span>
            <span className={cn('flex size-6 items-center justify-center rounded-full', keep ? 'bg-[#E6F4EE] text-success' : 'bg-ink-800 text-fg-subtle')}>{keep ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
          </div>
        ))}
        <div className="rounded-full bg-accent py-2.5 text-center text-[12px] font-semibold text-white">Build my app</div>
      </div>
    ),
  },
  {
    icon: Link2,
    tint: 'bg-[#FBF1DC] text-warning',
    title: 'Use your app',
    lead: 'A link for everyone, on any device.',
    body: 'Forms, lists, buttons and history are ready. The rules from your video are enforced, so nobody can, for example, lend the same tool twice. Download all your data any time.',
    screen: (
      <div className="space-y-2 p-4">
        <div className="rounded-xl bg-white p-3 text-center">
          <Check className="mx-auto size-6 text-success" />
          <p className="mt-1 text-[13px] font-semibold">Your app is ready</p>
        </div>
        <div className="rounded-full bg-accent py-2.5 text-center text-[12px] font-semibold text-white">Open my app</div>
        <div className="rounded-full border border-line bg-white py-2.5 text-center text-[12px] font-semibold">Download</div>
        <div className="truncate rounded-lg bg-white px-3 py-2 text-[11px] text-fg-subtle">yourapp.link/tool-lending</div>
      </div>
    ),
  },
  {
    icon: BarChart3,
    tint: 'bg-brand-50 text-accent',
    title: 'Grow with Plus',
    lead: 'From demo to the system your team runs on.',
    body: 'Upgrade when you like it: reuse the same video with deeper analysis, give your team access with roles, see reports, and connect your calendar and other tools.',
    screen: (
      <div className="space-y-2 p-4">
        <div className="rounded-xl bg-white p-3">
          <p className="text-[11px] text-fg-subtle">Loans this month</p>
          <div className="mt-2 flex h-14 items-end gap-1">
            {[30, 45, 25, 60, 50, 75, 65, 90].map((h, i) => (
              <span key={i} className="flex-1 rounded-t bg-brand" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[12px]">
          <Users className="size-4 text-accent" /> Anna · Staff
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[12px]">
          <CalendarDays className="size-4 text-accent" /> Calendar connected
        </div>
      </div>
    ),
  },
]

function Journey() {
  const [i, setI] = useState(0)
  const step = JOURNEY[i]
  return (
    <section id="how" className="scroll-mt-16 px-5 py-24" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1140px]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[15px] font-semibold text-accent">How it works</p>
          <h2 id="how-title" className="display mt-2 text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.08]">
            From a video to your app in five steps.
          </h2>
        </Reveal>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <div role="tablist" aria-label="Steps" className="flex gap-2 overflow-x-auto pb-2">
              {JOURNEY.map((s, k) => (
                <button
                  key={s.title}
                  role="tab"
                  aria-selected={i === k}
                  onClick={() => setI(k)}
                  className={cn('flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors', i === k ? 'bg-fg text-white' : 'bg-ink-900 text-fg-muted hover:bg-ink-850')}
                >
                  <span className="text-[13px] opacity-70">{k + 1}</span> {s.title}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={i} role="tabpanel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }} className="mt-8">
                <span className={cn('flex size-14 items-center justify-center rounded-2xl', step.tint)}>
                  <step.icon className="size-7" />
                </span>
                <h3 className="display mt-6 text-[clamp(1.6rem,3vw,2.2rem)] leading-tight">{step.lead}</h3>
                <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-fg-muted">{step.body}</p>
                <div className="mt-8 flex gap-3">
                  {i > 0 && (
                    <button onClick={() => setI(i - 1)} className="rounded-full border border-line px-5 py-2.5 text-[15px] font-medium hover:bg-ink-900">
                      Back
                    </button>
                  )}
                  {i < JOURNEY.length - 1 ? (
                    <button onClick={() => setI(i + 1)} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-accent-dim">
                      Next: {JOURNEY[i + 1].title} <ArrowRight className="size-4" />
                    </button>
                  ) : (
                    <ButtonLink to="/studio/new" variant="primary">
                      Try it free
                    </ButtonLink>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mx-auto">
            <PhoneMock>
              <AnimatePresence mode="wait">
                <motion.div key={i} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  {step.screen}
                </motion.div>
              </AnimatePresence>
            </PhoneMock>
          </div>
        </div>
      </div>
    </section>
  )
}

// --- Features ------------------------------------------------------------------------------------

const FEATURES = [
  { icon: ClipboardList, tint: 'bg-brand-50 text-accent', title: 'Forms and lists', body: 'Everything you track — customers, items, orders — with the right fields, ready on phone and desktop.' },
  { icon: ShieldCheck, tint: 'bg-[#E6F4EE] text-success', title: 'Your rules, enforced', body: '“Nothing goes out twice.” “No deposit, no rental.” The app refuses mistakes — on the server, every time.' },
  { icon: BarChart3, tint: 'bg-[#F0ECFF] text-[#6B4FD8]', title: 'Reports', body: 'What’s open, what’s overdue, what earns most, and how many mistakes the rules prevented.', plus: true },
  { icon: Users, tint: 'bg-[#FBF1DC] text-warning', title: 'Team access and roles', body: 'Personal links for each colleague. Owner, manager, staff or view-only — each sees only what they may do.', plus: true },
  { icon: CalendarDays, tint: 'bg-brand-50 text-accent', title: 'Connects to your tools', body: 'Calendar subscription for every date, spreadsheet export, and webhooks to Zapier or your own systems. The tools you mention in your video are suggested automatically.', plus: true },
  { icon: RefreshCw, tint: 'bg-[#E6F4EE] text-success', title: 'Changes in one sentence', body: '“Customers should also give an email address.” Small requests become precise changes you approve. Bigger changes: just record again.' },
  { icon: Download, tint: 'bg-[#F0ECFF] text-[#6B4FD8]', title: 'Your data stays yours', body: 'Download everything as a ZIP with spreadsheets. Full history of every change, effect and rejected mistake.' },
  { icon: Lock, tint: 'bg-[#FBF1DC] text-warning', title: 'Private by design', body: 'The AI is Google’s open Gemma model, run through Ollama. Your recordings are stored on the Code Your Reality server, used only to build your app, and deleted with it.' },
]

function Features() {
  return (
    <section id="features" className="scroll-mt-16 bg-ink-900 px-5 py-24" aria-labelledby="features-title">
      <div className="mx-auto max-w-[1140px]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[15px] font-semibold text-accent">What you get</p>
          <h2 id="features-title" className="display mt-2 text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.08]">
            A real business app, not a mock-up.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 0.05}>
              <div className="h-full rounded-3xl bg-white p-6">
                <div className="flex items-start justify-between">
                  <span className={cn('flex size-11 items-center justify-center rounded-2xl', f.tint)}>
                    <f.icon className="size-5" />
                  </span>
                  {f.plus && <span className="rounded-full bg-fg px-2.5 py-1 text-[11px] font-semibold text-white">Plus</span>}
                </div>
                <h3 className="mt-5 text-[19px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// --- Try it + use cases ---------------------------------------------------------------------------

function TryIt() {
  return (
    <section className="px-5 py-24" aria-labelledby="try-title">
      <div className="mx-auto grid max-w-[1140px] items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="text-[15px] font-semibold text-accent">Try it right here</p>
          <h2 id="try-title" className="display mt-2 text-[clamp(2rem,4.2vw,3rem)] leading-[1.08]">
            This app was made from a 60-second video.
          </h2>
          <p className="mt-4 text-[18px] leading-relaxed text-fg-muted">A rental clerk showed how renting works at the counter. Try to rent the same camera twice — the rule from the video stops you.</p>
          <ButtonLink to="/demo" variant="secondary" className="mt-8" iconRight={<ArrowRight className="size-4" />}>
            Open the full example
          </ButtonLink>
        </Reveal>
        <Reveal delay={0.1}>
          <MiniRentalApp />
          <p className="mt-3 text-center text-[13px] text-fg-subtle">Preview with sample data, running in your browser.</p>
        </Reveal>
      </div>
    </section>
  )
}

const USE_CASES = [
  { icon: Camera, title: 'Equipment rental', body: 'Items, customers, deposits, returns.' },
  { icon: Wrench, title: 'Repair service', body: 'Jobs, parts, status, ready-for-pickup.' },
  { icon: Hammer, title: 'Tool library', body: 'Members, loans, due dates, condition.' },
  { icon: PartyPopper, title: 'Event equipment', body: 'Bookings, delivery, pick-up, damage.' },
  { icon: Warehouse, title: 'Small warehouse', body: 'Stock in, stock out, minimum levels.' },
  { icon: Bike, title: 'Bike & scooter hire', body: 'Fleet, hourly rentals, availability.' },
]

function UseCases() {
  return (
    <section className="bg-ink-900 px-5 py-24" aria-labelledby="uses-title">
      <div className="mx-auto max-w-[1140px]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="uses-title" className="display text-[clamp(2rem,4.2vw,3rem)] leading-[1.08]">
            Made for small businesses with real processes.
          </h2>
          <p className="mt-4 text-[18px] text-fg-muted">If you can show it, we can build it. A few examples:</p>
        </Reveal>
        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3">
          {USE_CASES.map((u, i) => (
            <Reveal key={u.title} delay={(i % 3) * 0.05}>
              <div className="flex h-full items-start gap-4 rounded-3xl bg-white p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-accent">
                  <u.icon className="size-5" />
                </span>
                <div>
                  <p className="text-[17px] font-semibold">{u.title}</p>
                  <p className="mt-1 text-[14px] text-fg-subtle">{u.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// --- Pricing -------------------------------------------------------------------------------------

function Pricing() {
  const [table, setTable] = useState(false)
  return (
    <section id="pricing" className="scroll-mt-16 px-5 py-24" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-[1140px]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[15px] font-semibold text-accent">Pricing</p>
          <h2 id="pricing-title" className="display mt-2 text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.08]">
            Start free. Upgrade when it works for you.
          </h2>
          <p className="mt-4 text-[18px] text-fg-muted">Build your demo with your own process. When you like it, Plus turns it into the system your team uses — with the same video.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.05}>
              <div className={cn('relative flex h-full flex-col rounded-3xl p-6', p.featured ? 'bg-gradient-to-b from-[#0B1B26] to-[#16303F] text-white' : 'border border-line-soft bg-white')}>
                {p.featured && <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-[12px] font-semibold text-fg">Most popular</span>}
                <p className="text-[16px] font-semibold">{p.name}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="display text-[40px] leading-none">{p.price}</span>
                  {p.period && <span className={cn('text-[15px]', p.featured ? 'text-white/70' : 'text-fg-subtle')}>{p.period}</span>}
                </p>
                <p className={cn('mt-3 text-[15px] leading-relaxed', p.featured ? 'text-white/80' : 'text-fg-muted')}>{p.blurb}</p>
                <ul className="mt-5 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[14px]">
                      <Check className={cn('mt-0.5 size-4 shrink-0', p.featured ? 'text-brand-200' : 'text-accent')} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  {p.id === 'care' ? (
                    <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center rounded-full border border-line text-[15px] font-semibold hover:bg-ink-900">
                      {p.cta}
                    </a>
                  ) : (
                    <ButtonLink to={p.id === 'free' ? '/studio/new' : `/studio/upgrade?plan=${p.id}`} variant={p.featured ? 'primary' : 'secondary'} className={cn('w-full', p.featured && 'bg-brand text-fg hover:bg-brand-200')}>
                      {p.cta}
                    </ButtonLink>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-8 text-center">
          <button onClick={() => setTable(!table)} aria-expanded={table} className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent">
            Compare plans <ChevronDown className={cn('size-4 transition-transform', table && 'rotate-180')} />
          </button>
        </div>
        {table && (
          <div className="mt-6 overflow-x-auto rounded-3xl border border-line-soft">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="bg-ink-900">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    &nbsp;
                  </th>
                  {['Free demo', 'Plus', 'Business'].map((h) => (
                    <th key={h} scope="col" className="px-5 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-t border-line-soft">
                    <th scope="row" className="px-5 py-3 font-normal text-fg-muted">
                      {row.label}
                    </th>
                    {row.values.map((v, k) => (
                      <td key={k} className={cn('px-5 py-3', v === '—' ? 'text-fg-subtle' : v === '✓' ? 'text-success' : '')}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] leading-relaxed text-fg-subtle">
          Prices in euros, VAT excluded. In this preview, payment isn’t connected yet: upgrading uses a demo checkout that switches the plan on without charging anything.
        </p>
      </div>
    </section>
  )
}

// --- Support, FAQ, CTA --------------------------------------------------------------------------

function Support() {
  return (
    <section className="px-5 pb-24" aria-labelledby="support-title">
      <div className="mx-auto grid max-w-[1140px] items-center gap-8 rounded-[32px] bg-gradient-to-br from-[#E8F6FF] to-[#CCECFF] p-8 sm:p-12 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 id="support-title" className="display text-[clamp(1.8rem,3.4vw,2.6rem)] leading-[1.1]">
            Real people behind it: Integrint.
          </h2>
          <p className="mt-4 text-[18px] leading-relaxed text-fg-muted">
            Integrint is a Hungarian digital agency for web, marketing and custom software. We help you record your first process, check what the AI found, and keep your app in shape as your business grows.
          </p>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-[17px] font-semibold text-accent hover:underline">
            Contact Integrint <ArrowRight className="size-4" />
          </a>
        </div>
        <ul className="space-y-3">
          {['Help with your first recording', 'Review of your app with you', 'Changes you can’t describe in a sentence', 'Hosting and backups (Integrint Care)'].map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 text-[15px] font-medium">
              <MessageSquareText className="size-5 shrink-0 text-accent" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const FAQ = [
  ['Do I need technical knowledge?', 'No. You record your process, check the result in plain language, and press a button. The advanced editor exists for those who want it.'],
  ['What happens to my video?', 'It’s stored on the Code Your Reality server and used only to build your app. The AI is Google’s open Gemma model, run through Ollama — on our own server or through Ollama Cloud, in which case only the transcript and a few still frames are sent for analysis. Deleting an app deletes its video.'],
  ['What if the AI misunderstands something?', 'Nothing goes live without your OK. Every finding shows the sentence it came from, guesses are flagged, and you can leave anything out. Later you can record again or request a small change.'],
  ['What can’t it do yet?', 'Complex calculations (like fees or invoices) are kept as notes, not enforced. Online payment, email notifications and invoicing connections are planned.'],
  ['Can I take my data with me?', 'Yes. Download a ZIP with your app definition, spreadsheets of every list, and the full history — on every plan.'],
  ['What is the difference between the demo and Plus?', 'The free demo builds one app so you can try it with your real process. Plus re-uses your video with a deeper analysis and adds reports, team access with roles, connections, and more apps.'],
]

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 bg-ink-900 px-5 py-24" aria-labelledby="faq-title">
      <div className="mx-auto max-w-[760px]">
        <h2 id="faq-title" className="display text-center text-[clamp(2rem,4vw,3rem)] leading-[1.08]">
          Questions
        </h2>
        <div className="mt-10 divide-y divide-line-soft rounded-3xl bg-white">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                {q}
                <ChevronDown className="size-5 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-[16px] leading-relaxed text-fg-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="px-5 py-24 text-center">
      <Reveal className="mx-auto max-w-3xl rounded-[36px] bg-gradient-to-br from-[#00A1FF] to-[#0077BE] px-6 py-16 text-white sm:px-12">
        <h2 className="display text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.06]">Your next app starts with a video.</h2>
        <p className="mx-auto mt-4 max-w-lg text-[18px] text-white/85">Record your process today. See your app before lunch.</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/studio/new" className="inline-flex h-13 w-full items-center justify-center rounded-full bg-white px-7 text-[17px] font-semibold text-accent hover:bg-brand-50 sm:w-auto">
            Try it free
          </Link>
          <Link to="/demo" className="inline-flex h-13 w-full items-center justify-center gap-1.5 rounded-full px-7 text-[17px] font-semibold text-white ring-1 ring-white/50 hover:bg-white/10 sm:w-auto">
            See a ready example <ArrowRight className="size-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line-soft px-5 py-10">
      <div className="mx-auto flex max-w-[1140px] flex-col gap-6 text-[14px] text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark withWord={false} />
          <span>Code Your Reality · © 2026 Integrint Kft.</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-accent">
              {label}
            </a>
          ))}
          <Link to="/login" className="hover:text-accent">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="bg-white">
      <Nav />
      <main id="main">
        <Hero />
        <Contrast />
        <Journey />
        <Features />
        <TryIt />
        <UseCases />
        <Pricing />
        <Support />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
