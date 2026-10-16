import { Link, NavLink, Outlet } from 'react-router-dom'
import { motion } from 'motion/react'
import { AppWindow, House, Plus, UserRound } from 'lucide-react'
import { BrandMark } from '../ui/primitives'
import { cn } from '../../lib/cn'

const NAV = [
  { to: '/studio', label: 'Home', icon: House, end: true },
  { to: '/studio/new', label: 'New app', icon: Plus },
  { to: '/studio/apps', label: 'My apps', icon: AppWindow },
  { to: '/studio/settings', label: 'Account', icon: UserRound },
]

export default function StudioShell() {
  return (
    <div className="min-h-dvh bg-ink-950 text-fg">
      {/* Top bar (all sizes) */}
      <header className="sticky top-0 z-40 border-b border-line-soft/70 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Reality Compiler home">
            <BrandMark />
          </Link>
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
      </header>

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
