import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ErrorState, LoadingState } from './ui/primitives'
import { useMe } from '../lib/queries'

/** Shows its children only to a signed-in person; everyone else goes to the sign-in screen. */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const me = useMe()
  const location = useLocation()
  if (me.isLoading) return <LoadingState className="min-h-dvh" label="Loading" />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} className="m-6" />
  if (!me.data?.user) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (admin && me.data.user.role !== 'admin') return <Navigate to="/studio" replace />
  return <>{children}</>
}
