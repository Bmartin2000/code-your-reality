import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { setProjectCache } from '../lib/queries'
import { ErrorState, LoadingState } from '../components/ui/primitives'

/** Creates a fresh guided sample project and opens it. */
export default function StartDemo() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const started = useRef(false)
  const [error, setError] = useState<unknown>(null)

  const run = () => {
    setError(null)
    api
      .createSample()
      .then((p) => {
        setProjectCache(qc, p)
        navigate(`/studio/projects/${p.id}`, { replace: true })
      })
      .catch(setError)
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-ink-950 p-6">
      {error ? <ErrorState error={error} onRetry={run} className="w-full max-w-lg" /> : <LoadingState label="Preparing the guided sample" />}
    </main>
  )
}
