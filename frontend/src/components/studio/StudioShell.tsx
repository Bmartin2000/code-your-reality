import { Link, NavLink, Outlet } from 'react-router-dom'
import { motion } from 'motion/react'
import { AppWindow, FlaskConical, House, LifeBuoy, Plus, UserRound } from 'lucide-react'
import { BrandMark } from '../ui/primitives'
import { useAccount, useMe } from '../../lib/queries'
import { cn } from '../../lib/cn'

const NAV = [
  { to: '/studio', label: 'Home', icon: House, end: true },
  { to: '/studio/new', label: 'New app', icon: Plus },
  { to: '/studio/apps', label: 'My apps', icon: AppWindow },
  { to: '/studio/settings', label: 'Account', icon: UserRound },
]

export default function StudioShell() {
  const account = useAccount()
  const me = useMe()
  const owner = !!me.data?.user?.super_admin
  const plan = account.data?.plan
  return (
    <div className="min-h-dvh bg-ink-950 text-fg">
      {/* Top bar (all sizes) */}
      <header className="sticky top-0 z-40 border-b border-line-soft/70 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Code Your Reality home">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2">
          <NavLink
            to="/studio/support"
            aria-label="Help & support"
            title="Help & support"
            className={({ isActive }) => cn('flex size-9 items-center justify-center rounded-full md:order-last', isActive ? 'bg-brand-50 text-accent' : 'text-fg-muted hover:bg-ink-900 hover:text-fg')}
          >
            <LifeBuoy className="size-5" />
          </NavLink>
          {plan && (
            <Link
              to={plan.id === 'free' && (owner || account.data?.test_mode) ? '/studio/upgrade?plan=plus' : '/studio/settings'}
              className={cn('rounded-full px-3 py-1.5 text-[13px] font-semibold md:order-last', plan.id === 'free' ? 'bg-accent text-white' : 'bg-brand-50 text-accent')}
            >
              {plan.id === 'free' && (owner || account.data?.test_mode) ? 'Upgrade to Plus' : plan.name}
            </Link>
          )}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Studio">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => cn('rounded-full px-4 py-2 text-[14px] transition-colors', isActive ? 'bg-ink-800 text-fg' : 'text-fg-muted hover:text-fg')}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          </div>
        </div>
      </header>

      {account.data?.test_mode && (
        <Link
          to="/studio/settings"
          role="status"
          className="flex items-center justify-center gap-2 bg-[#FFF3D6] px-4 py-2 text-center text-[13px] font-medium text-warning"
        >
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          Subscription Test Mode: you’re using the app as {account.data.plan.name}. Real plan unchanged.
        </Link>
      )}

      <main id="main" className="pb-24 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom tab bar (phones) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-ink-900/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Studio">
        <ul className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-accent' : 'text-fg-subtle')}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="tab-active" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                    <Icon className="size-[22px]" aria-hidden />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
