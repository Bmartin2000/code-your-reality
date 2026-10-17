import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { BrandMark, ErrorState, LoadingState } from '../components/ui/primitives'
import { api, fieldErrors } from '../lib/api'
import { qk, useMe } from '../lib/queries'

/** Only same-site paths are allowed as the place to return to after signing in. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/studio'
}

export default function Login() {
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [wantsSignup, setWantsSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (me.isLoading) return <LoadingState className="min-h-dvh" label="Loading" />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} className="m-6" />
  if (me.data?.user) return <Navigate to={next} replace />

  const setup = !!me.data?.needs_setup
  const signup = setup || (wantsSignup && !!me.data?.signup_open)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (signup && !name.trim()) errs.name = 'Enter your name.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Enter a valid email address.'
    if (signup ? password.length < 8 : !password) errs.password = signup ? 'Use at least 8 characters.' : 'Enter your password.'
    setErrors(errs)
    setFormError(null)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (signup) await api.register(name.trim(), email.trim(), password)
      else await api.login(email.trim(), password)
      qc.clear() // nothing cached from before signing in belongs to this person
      await qc.fetchQuery({ queryKey: qk.me, queryFn: api.me })
      navigate(next, { replace: true })
    } catch (err) {
      const fields = fieldErrors(err)
      if (fields) setErrors(fields)
      else setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = setup ? 'Create the admin account' : signup ? 'Create your account' : 'Sign in'

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-ink-950 px-4 py-10">
      <Link to="/" aria-label="Code Your Reality home" className="mb-8">
        <BrandMark />
      </Link>
      <form onSubmit={submit} noValidate className="w-full max-w-[400px] rounded-3xl border border-line-soft bg-white p-6 shadow-sm sm:p-8">
        <h1 className="display text-[28px] leading-tight">{title}</h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          {setup
            ? 'This is a new installation. The first account becomes the admin, who can add everyone else.'
            : 'The Studio uses the video and AI services, so it is for signed-in members only.'}
        </p>
        {setup && (
          <p className="mt-4 flex gap-2 rounded-2xl bg-brand-50 p-3 text-[14px] text-accent">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" /> You will be the admin.
          </p>
        )}

        {signup && (
          <label className="mt-5 block">
            <span className="mb-1.5 block text-[15px] font-medium">Name</span>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errors.name || undefined} />
            {errors.name && <span className="mt-1 block text-[13px] text-error">{errors.name}</span>}
          </label>
        )}
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[15px] font-medium">Email</span>
          <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.email || undefined} />
          {errors.email && <span className="mt-1 block text-[13px] text-error">{errors.email}</span>}
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[15px] font-medium">Password</span>
          <input
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? 'new-password' : 'current-password'}
            aria-invalid={!!errors.password || undefined}
          />
          {errors.password && <span className="mt-1 block text-[13px] text-error">{errors.password}</span>}
        </label>

        {formError && (
          <p role="alert" className="mt-4 rounded-2xl bg-[#FDECEC] p-3 text-[14px] text-error">
            {formError}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" loading={busy}>
          {setup ? 'Create admin account' : signup ? 'Create account' : 'Sign in'}
        </Button>

        {!setup && (
          <p className="mt-4 text-center text-[14px] text-fg-muted">
            {me.data?.signup_open ? (
              <button type="button" className="font-medium text-accent" onClick={() => (setWantsSignup(!wantsSignup), setErrors({}), setFormError(null))}>
                {signup ? 'I already have an account' : 'Create an account'}
              </button>
            ) : (
              'No account yet? Ask your admin to add you.'
            )}
          </p>
        )}
      </form>
    </main>
  )
}
