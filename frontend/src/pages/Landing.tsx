import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Camera, Check, Download, Link2, Lock, Menu, MessageSquareText, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react'
import { HeroVisual } from '../components/landing/HeroVisual'
import { MiniRentalApp } from '../components/landing/MiniRentalApp'
import { BrandMark } from '../components/ui/primitives'
import { ButtonLink } from '../components/ui/Button'
import { cn } from '../lib/cn'
import { PLANS, SUPPORT_URL } from '../lib/plans'

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

const LINKS = [
  ['#how', 'How it works'],
  ['#pricing', 'Pricing'],
  ['#support', 'Support'],
] as const

function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-50 border-b border-line-soft/70 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-5">
        <Link to="/" aria-label="Reality Compiler home">
          <BrandMark />
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="text-[14px] text-fg-muted transition-colors hover:text-fg">
              {label}
            </a>
          ))}
          <Link to="/studio" className="text-[14px] text-fg-muted transition-colors hover:text-fg">
            Sign in
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink to="/studio/new" variant="primary" size="sm" className="hidden sm:inline-flex">
            Start free pilot
          </ButtonLink>
          <button className="inline-flex size-10 items-center justify-center rounded-full text-fg md:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line-soft bg-ink-900 px-5 pb-6 pt-2 md:hidden" aria-label="Primary">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="block border-b border-line-soft py-4 text-[17px] text-fg">
              {label}
            </a>
          ))}
          <Link to="/studio" className="block border-b border-line-soft py-4 text-[17px] text-fg">
            Sign in
          </Link>
          <ButtonLink to="/studio/new" variant="primary" size="lg" className="mt-5 w-full">
            Start free pilot
          </ButtonLink>
        </nav>
      )}
    </header>
  )
}

function Hero() {
  return (
    <section className="px-5 pb-16 pt-16 text-center sm:pt-24" aria-labelledby="hero-title">
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[15px] font-medium text-accent">
        Reality Compiler
      </motion.p>
      <motion.h1
        id="hero-title"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="display mx-auto mt-3 max-w-4xl text-[clamp(2.6rem,7vw,5.25rem)] leading-[1.02] text-fg"
      >
        Show your work.
        <br />
        <span className="text-fg-subtle">Get your app.</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }} className="mx-auto mt-6 max-w-xl text-[19px] leading-relaxed text-fg-muted">
        Film how your business runs with your phone. AI turns it into a working app — checked by you, ready on any device.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <ButtonLink to="/studio/new" variant="primary" size="lg" className="w-full sm:w-auto">
          Start free pilot
        </ButtonLink>
        <ButtonLink to="/demo" variant="ghost" size="lg" className="w-full text-accent hover:text-accent sm:w-auto" iconRight={<ArrowRight className="size-4" />}>
          Try the demo
        </ButtonLink>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mt-16 max-w-[1120px] rounded-[28px] border border-line-soft bg-ink-900 p-4 text-left shadow-[0_30px_80px_-40px_rgba(0,0,0,0.25)] sm:p-8"
      >
        <HeroVisual />
      </motion.div>
    </section>
  )
}

const STEPS = [
  { icon: Camera, title: 'Record', body: 'Open the camera and do the job as usual. Say out loud what you check and what must never happen.' },
  { icon: Sparkles, title: 'AI understands', body: 'An open AI model running on your own computer finds what you track, the steps, and the rules.' },
  { icon: ShieldCheck, title: 'You confirm', body: 'Every suggestion shows the moment it came from. Nothing becomes part of your app until you say yes.' },
  { icon: Link2, title: 'Use your app', body: 'Open it with a link on any phone or computer, or download it with all your data.' },
]

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 bg-ink-900 px-5 py-24" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="text-center">
          <h2 id="how-title" className="display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.05]">
            Four steps. No specification.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] text-fg-muted">You already know how your business works. Show it once — we turn it into software.</p>
        </Reveal>
        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06}>
              <li className="h-full rounded-3xl bg-ink-950 p-6">
                <span className="flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <s.icon className="size-5" />
                </span>
                <p className="mt-6 text-[13px] font-medium text-fg-subtle">Step {i + 1}</p>
                <h3 className="mt-1 text-[21px] font-semibold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

function KeepsUp() {
  const items = [
    { icon: RefreshCw, title: 'Something changed? Record again.', body: 'A new video updates your app. Every earlier version is kept, so nothing is lost.' },
    { icon: MessageSquareText, title: 'Small tweaks in one sentence.', body: '“Make the phone number required.” Short requests become precise changes you approve.' },
    { icon: Download, title: 'Your data stays yours.', body: 'Export everything as spreadsheets at any time. No lock-in.' },
  ]
  return (
    <section className="px-5 py-24" aria-labelledby="keeps-title">
      <div className="mx-auto grid max-w-[1120px] items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <h2 id="keeps-title" className="display text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05]">
            An app that keeps up with your business.
          </h2>
          <ul className="mt-10 space-y-7">
            {items.map((it) => (
              <li key={it.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-900 text-accent shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                  <it.icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-[17px] font-semibold">{it.title}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-fg-muted">{it.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mb-3 text-center text-[13px] text-fg-subtle">Try it: a rental app made from a 60-second video</p>
          <MiniRentalApp />
          <p className="mt-3 text-center text-[13px] text-fg-subtle">Preview with sample data. Try renting the same camera twice.</p>
        </Reveal>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 bg-ink-900 px-5 py-24" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="text-center">
          <h2 id="pricing-title" className="display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.05]">
            Simple monthly plans.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] text-fg-muted">Less than a single hour of custom development. Cancel any time.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.06}>
              <div className={cn('flex h-full flex-col rounded-3xl p-7', p.featured ? 'bg-fg text-ink-900' : 'bg-ink-950')}>
                <p className="text-[15px] font-semibold">{p.name}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="display text-[44px] leading-none">{p.price}</span>
                  {p.period && <span className={cn('text-[15px]', p.featured ? 'text-ink-700' : 'text-fg-subtle')}>{p.period}</span>}
                </p>
                <p className={cn('mt-3 text-[15px] leading-relaxed', p.featured ? 'text-ink-700' : 'text-fg-muted')}>{p.blurb}</p>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[15px]">
                      <Check className={cn('mt-0.5 size-4 shrink-0', p.featured ? 'text-[#64B5FF]' : 'text-accent')} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  {p.id === 'care' ? (
                    <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center rounded-full border border-line bg-ink-900 text-[15px] font-medium text-fg hover:bg-ink-850">
                      Talk to Integrint
                    </a>
                  ) : (
                    <ButtonLink to={`/studio/new?plan=${p.id}`} variant={p.featured ? 'primary' : 'secondary'} className="w-full">
                      Start free pilot
                    </ButtonLink>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] leading-relaxed text-fg-subtle">
          Introductory prices in euros, VAT excluded. Online payment isn't switched on in this preview: every plan starts as a free pilot, and Integrint contacts you before anything is billed.
        </p>
      </div>
    </section>
  )
}

function Support() {
  return (
    <section id="support" className="scroll-mt-16 px-5 py-24" aria-labelledby="support-title">
      <div className="mx-auto grid max-w-[1120px] gap-6 lg:grid-cols-2">
        <Reveal className="rounded-3xl bg-ink-900 p-8 sm:p-10">
          <h2 id="support-title" className="display text-[clamp(1.8rem,3.5vw,2.5rem)] leading-[1.08]">
            Real people behind it.
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-fg-muted">
            Support is provided by <span className="font-semibold text-fg">Integrint</span>. We help you record your first process, review what the AI found, and keep your app in shape as your business changes.
          </p>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-[17px] font-medium text-accent hover:underline">
            Contact Integrint support <ArrowRight className="size-4" />
          </a>
        </Reveal>
        <Reveal delay={0.08} className="rounded-3xl bg-ink-900 p-8 sm:p-10">
          <span className="flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Lock className="size-5" />
          </span>
          <h3 className="mt-6 text-[24px] font-semibold tracking-[-0.02em]">Your videos stay with you.</h3>
          <p className="mt-3 text-[17px] leading-relaxed text-fg-muted">
            The AI is an open model that runs on your own computer (Google's Gemma via Ollama). Recordings and customer data are never sent to a cloud AI service.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="px-5 pb-28 pt-8 text-center">
      <Reveal>
        <h2 className="display mx-auto max-w-3xl text-[clamp(2.2rem,5vw,4rem)] leading-[1.04]">The next app for your business starts with a video.</h2>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink to="/studio/new" variant="primary" size="lg" className="w-full sm:w-auto">
            Start free pilot
          </ButtonLink>
          <ButtonLink to="/demo" variant="ghost" size="lg" className="w-full text-accent hover:text-accent sm:w-auto" iconRight={<ArrowRight className="size-4" />}>
            Try the demo
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line-soft bg-ink-950 px-5 py-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 text-[13px] text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark withWord={false} />
          <span>Reality Compiler · support by Integrint</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <a href="#how" className="hover:text-fg">How it works</a>
          <a href="#pricing" className="hover:text-fg">Pricing</a>
          <Link to="/demo" className="hover:text-fg">Demo</Link>
          <Link to="/studio" className="hover:text-fg">Sign in</Link>
        </nav>
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
        <HowItWorks />
        <KeepsUp />
        <Pricing />
        <Support />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
