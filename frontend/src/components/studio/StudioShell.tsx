import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AppWindow, FolderKanban, LayoutGrid, Menu, Plus, Settings2, X } from 'lucide-react'
import { BrandMark, TechnicalLabel } from '../ui/primitives'
import { useCapabilities } from '../../lib/queries'
import { cn } from '../../lib/cn'

const NAV = [
  { to: '/studio', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/studio/projects', label: 'Projects', icon: FolderKanban },
  { to: '/studio/new', label: 'New Compilation', icon: Plus },
  { to: '/studio/apps', label: 'Recent Applications', icon: AppWindow },
  { to: '/studio/settings', label: 'Settings', icon: Settings2 },
]

function ModelStatusChip({ collapsed }: { collapsed?: boolean }) {
  const { data, isError } = useCapabilities()
  const ok = data?.model.reachable && data.model.installed
  const color = isError ? 'var(--color-error)' : !data ? 'var(--color-fg-subtle)' : ok ? 'var(--color-success)' : 'var(--color-warning)'
  const text = isError ? 'Backend offline' : !data ? 'Checking…' : ok ? data.model.model : 'Model unavailable'
  return (
    <Link
      to="/studio/settings"
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-800"
      title={`AI engine: ${text}`}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {!collapsed && (
        <span className="min-w-0">
          <TechnicalLabel className="block">AI engine</TechnicalLabel>
          <span className="block truncate font-mono text-[11px] text-fg-muted">{text}</span>
        </span>
      )}
    </Link>
  )
}

function NavItems({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors',
                isActive ? 'bg-ink-800 text-fg' : 'text-fg-muted hover:bg-ink-850 hover:text-fg',
                collapsed && 'justify-center px-0',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-accent" transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} />}
                <Icon className={cn('size-4 shrink-0', isActive ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted')} aria-hidden />
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export default function StudioShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="min-h-dvh bg-ink-950 text-fg">
      {/* Desktop / tablet rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[68px] flex-col border-r border-line-soft bg-ink-925 md:flex xl:w-[232px]" aria-label="Studio navigation">
        <div className="flex h-16 items-center px-4 xl:px-5">
          <Link to="/" aria-label="Reality Compiler home">
            <BrandMark withWord={false} className="xl:hidden" />
            <BrandMark className="hidden xl:inline-flex" />
          </Link>
        </div>
        <TechnicalLabel className="mb-2 hidden px-5 xl:block">Studio</TechnicalLabel>
        <nav className="px-2.5 xl:px-3">
          <div className="xl:hidden">
            <NavItems collapsed />
          </div>
          <div className="hidden xl:block">
            <NavItems />
          </div>
        </nav>
        <div className="mt-auto border-t border-line-soft p-2.5 xl:p-3">
          <div className="xl:hidden">
            <ModelStatusChip collapsed />
          </div>
          <div className="hidden xl:block">
            <ModelStatusChip />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line-soft bg-ink-950/90 px-4 backdrop-blur md:hidden">
        <Link to="/" aria-label="Reality Compiler home">
          <BrandMark />
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-fg-muted"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <Menu className="size-4" />
        </button>
      </header>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink-950/80" onClick={() => setMobileOpen(false)} />
            <motion.nav
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col border-r border-line bg-ink-925 p-4"
              aria-label="Studio navigation"
            >
              <div className="mb-6 flex items-center justify-between">
                <BrandMark />
                <button onClick={() => setMobileOpen(false)} className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted" aria-label="Close navigation">
                  <X className="size-4" />
                </button>
              </div>
              <NavItems onNavigate={() => setMobileOpen(false)} />
              <div className="mt-auto">
                <ModelStatusChip />
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>

      <main id="main" className="md:pl-[68px] xl:pl-[232px]">
        <Outlet />
      </main>
    </div>
  )
}
