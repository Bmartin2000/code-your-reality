import { ArrowLeft } from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { TechnicalLabel } from '../components/ui/primitives'

export default function NotFound({ embedded }: { embedded?: boolean }) {
  return (
    <div id={embedded ? undefined : 'main'} className={embedded ? 'px-6 py-24' : 'flex min-h-dvh items-center justify-center bg-ink-950 px-6'}>
      <div className="mx-auto max-w-lg text-center">
        <TechnicalLabel>Error 404 · no such route</TechnicalLabel>
        <h1 className="display mt-4 text-5xl text-fg md:text-6xl">
          Nothing was <span className="serif-accent text-fg-muted">observed</span> here.
        </h1>
        <p className="mt-4 text-fg-muted">The address doesn't match a page, project or application.</p>
        <div className="mt-8 flex justify-center gap-2">
          <ButtonLink to="/" variant="secondary" icon={<ArrowLeft className="size-4" />}>
            Home
          </ButtonLink>
          <ButtonLink to="/studio" variant="primary">
            Open the Studio
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
