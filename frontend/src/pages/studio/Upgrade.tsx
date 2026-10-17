import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { BarChart3, Check, CreditCard, Info, Link2, RefreshCw, Sparkles, Users } from 'lucide-react'
import { Button, ButtonLink } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/primitives'
import { api, ApiError } from '../../lib/api'
import { qk, useAccount, useMe, useProjects } from '../../lib/queries'
import { PLANS } from '../../lib/plans'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/cn'

const UNLOCKS = [
  { icon: RefreshCw, text: 'Re-analyze your existing video with twice as many frames' },
  { icon: BarChart3, text: 'Reports: open, overdue, revenue, mistakes prevented' },
  { icon: Users, text: 'Team access: personal links and roles for colleagues' },
  { icon: Link2, text: 'Connections: calendar feed, spreadsheets, webhooks' },
]

export default function Upgrade() {
  const [params] = useSearchParams()
  const [plan, setPlan] = useState<'plus' | 'business'>(params.get('plan') === 'business' ? 'business' : 'plus')
  const account = useAccount()
  const me = useMe()
  const owner = !!me.data?.user?.super_admin
  const projects = useProjects()
  const qc = useQueryClient()
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)

  if (account.isLoading) return <LoadingState />
  const current = account.data?.plan.id
  const chosen = PLANS.find((p) => p.id === plan)!

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!company.trim()) errs.company = 'Enter your company name.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Enter a valid email address.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const acc = await api.checkout(plan, company.trim(), email.trim())
      qc.setQueryData(qk.account, acc)
      qc.invalidateQueries({ queryKey: ['app'] })
      setDone(true)
    } catch (err) {
      toast.error('Upgrade failed', (err as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    const withVideo = (projects.data ?? []).filter((p) => p.origin === 'analysis' && p.media_name)
    return (
      <div className="mx-auto max-w-[640px] px-4 py-10 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-gradient-to-br from-[#00A1FF] to-[#0077BE] p-8 text-center text-white">
          <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto flex size-16 items-center justify-center rounded-full bg-white text-accent">
            <Sparkles className="size-8" />
          </motion.span>
          <h1 className="display mt-5 text-[32px] leading-tight">{chosen.name} is active.</h1>
          <p className="mt-2 text-[17px] text-white/85">Demo checkout — no payment was taken.</p>
        </motion.div>
        <section className="mt-4 rounded-3xl bg-ink-900 p-6">
          <h2 className="text-[19px] font-semibold">Make your app stronger</h2>
          <p className="mt-1 text-[15px] text-fg-muted">Re-use the video you already recorded for a deeper analysis, or record a new one.</p>
          {withVideo.length ? (
            <ul className="mt-4 space-y-2">
              {withVideo.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                  <span className="min-w-0 truncate text-[15px] font-medium">{p.workflow_name ?? p.name}</span>
                  <ButtonLink to={`/studio/projects/${p.id}`} size="sm" variant="secondary">
                    Open
                  </ButtonLink>
                </li>
              ))}
            </ul>
          ) : (
            <ButtonLink to="/studio/new" variant="primary" className="mt-4">
              Record a process
            </ButtonLink>
          )}
          <p className="mt-5 text-[14px] text-fg-subtle">In each app you’ll now find Reports, Connections and Team.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display text-[clamp(2rem,5vw,2.75rem)] leading-[1.08]">Upgrade your workspace</h1>
      <p className="mt-2 text-[17px] text-fg-muted">
        You’re on <span className="font-semibold text-fg">{account.data?.plan.name}</span>. Keep everything you’ve built — your apps get stronger.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.05fr]">
        <div className="space-y-3">
          {PLANS.filter((p) => p.id === 'plus' || p.id === 'business').map((p) => (
            <button
              key={p.id}
              onClick={() => setPlan(p.id as 'plus' | 'business')}
              aria-pressed={plan === p.id}
              className={cn('w-full rounded-3xl border-2 p-5 text-left transition-colors', plan === p.id ? 'border-accent bg-brand-50' : 'border-line-soft bg-white hover:border-line')}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[19px] font-semibold">{p.name}</span>
                <span>
                  <span className="display text-[26px]">{p.price}</span>
                  <span className="text-[14px] text-fg-subtle"> {p.period}</span>
                </span>
              </div>
              <p className="mt-1 text-[14px] text-fg-muted">{p.blurb}</p>
              {current === p.id && <p className="mt-2 text-[13px] font-medium text-success">Your current plan</p>}
            </button>
          ))}
          <ul className="space-y-3 rounded-3xl bg-ink-900 p-5">
            {UNLOCKS.map((u) => (
              <li key={u.text} className="flex items-start gap-3 text-[15px]">
                <u.icon className="mt-0.5 size-5 shrink-0 text-accent" /> {u.text}
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="rounded-3xl border border-line-soft bg-white p-6" noValidate>
          <h2 className="flex items-center gap-2 text-[19px] font-semibold">
            <CreditCard className="size-5 text-accent" /> Checkout
          </h2>
          <div className="mt-4 flex gap-3 rounded-2xl bg-[#FBF1DC] p-4 text-[14px] leading-relaxed text-warning">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Demo checkout.</span> Online payment isn’t connected in this preview. Confirming switches the plan on immediately and no money is charged. Integrint contacts you before any real billing starts.
            </p>
          </div>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-[15px] font-medium">Company name</span>
            <input className="field-input" value={company} onChange={(e) => setCompany(e.target.value)} aria-invalid={!!errors.company || undefined} autoComplete="organization" />
            {errors.company && <span className="mt-1 block text-[13px] text-error">{errors.company}</span>}
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[15px] font-medium">Billing email</span>
            <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email || undefined} autoComplete="email" />
            {errors.email && <span className="mt-1 block text-[13px] text-error">{errors.email}</span>}
          </label>
          <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-4 text-[16px]">
            <span>{chosen.name}, monthly</span>
            <span className="font-semibold">
              {chosen.price} {chosen.period}
            </span>
          </div>
          <p className="text-[13px] text-fg-subtle">Charged today: €0 (demo)</p>
          {!owner && !account.data?.test_mode && (
            <p className="mt-5 rounded-2xl bg-ink-900 p-3 text-[14px] text-fg-muted">Only the workspace owner (the account that created this workspace) can change the plan. Ask them to upgrade.</p>
          )}
          {account.data?.test_mode && (
            <p className="mt-5 rounded-2xl bg-[#FFF3D6] p-3 text-[14px] text-warning">
              You’re in Subscription Test Mode, so checkout is off and your real plan can’t change. Switch the test plan in{' '}
              <Link to="/studio/settings" className="font-medium underline">
                Account
              </Link>
              .
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" loading={busy} disabled={!!account.data?.test_mode || !owner} icon={<Check className="size-5" />}>
            Activate {chosen.name}
          </Button>
          <p className="mt-3 text-center text-[13px] text-fg-subtle">
            You can switch back to Free any time in <Link to="/studio/settings" className="text-accent">Account</Link>.
          </p>
        </form>
      </div>
    </div>
  )
}
