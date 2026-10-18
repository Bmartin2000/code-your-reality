import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { ApiError } from './lib/api'
import App from './App'
import { loadRuntimeConfig, ROUTER_BASENAME } from './lib/config'
import './index.css'

// A Studio request answered "please sign in" (session expired or user removed): refresh the
// sign-in state so the guard sends the person to the sign-in screen.
const onAuthError = (err: unknown) => {
  if (err instanceof ApiError && err.status === 401 && err.body.auth_required) queryClient.invalidateQueries({ queryKey: ['me'] })
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

await loadRuntimeConfig()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter basename={ROUTER_BASENAME || undefined}>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
