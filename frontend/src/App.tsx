import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from './components/ui/overlays'
import { LoadingState } from './components/ui/primitives'

const Landing = lazy(() => import('./pages/Landing'))
const StartDemo = lazy(() => import('./pages/StartDemo'))
const StudioShell = lazy(() => import('./components/studio/StudioShell'))
const Overview = lazy(() => import('./pages/studio/Overview'))
const Projects = lazy(() => import('./pages/studio/Projects'))
const NewCompilation = lazy(() => import('./pages/studio/NewCompilation'))
const RecentApps = lazy(() => import('./pages/studio/RecentApps'))
const Settings = lazy(() => import('./pages/studio/Settings'))
const ProjectLayout = lazy(() => import('./pages/studio/project/ProjectLayout'))
const ProjectHome = lazy(() => import('./pages/studio/project/ProjectHome'))
const Review = lazy(() => import('./pages/studio/project/Review'))
const Compile = lazy(() => import('./pages/studio/project/Compile'))
const EvidencePage = lazy(() => import('./pages/studio/project/EvidencePage'))
const GeneratedAppPage = lazy(() => import('./pages/apps/GeneratedAppPage'))
const NotFound = lazy(() => import('./pages/NotFound'))

function ScrollReset() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-ink-950"
      >
        Skip to content
      </a>
      <ScrollReset />
      <Suspense fallback={<LoadingState className="min-h-dvh" label="Loading" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<StartDemo />} />
          <Route path="/studio" element={<StudioShell />}>
            <Route index element={<Overview />} />
            <Route path="projects" element={<Projects />} />
            <Route path="new" element={<NewCompilation />} />
            <Route path="apps" element={<RecentApps />} />
            <Route path="settings" element={<Settings />} />
            <Route path="projects/:id" element={<ProjectLayout />}>
              <Route index element={<ProjectHome />} />
              <Route path="review" element={<Review />} />
              <Route path="compile" element={<Compile />} />
              <Route path="evidence" element={<EvidencePage />} />
            </Route>
            <Route path="*" element={<NotFound embedded />} />
          </Route>
          <Route path="/apps/:slug/*" element={<GeneratedAppPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}
