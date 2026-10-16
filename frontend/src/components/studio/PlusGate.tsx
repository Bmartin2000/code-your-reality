import { Sparkles } from 'lucide-react'
import { ButtonLink } from '../ui/Button'

/** Shown where a Plus feature would be: explains the value and links to the upgrade page. */
export function PlusGate({ title, body, points }: { title: string; body: string; points?: string[] }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#E8F6FF] to-[#CCECFF] p-6 sm:p-8">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 text-[12px] font-semibold text-white">
        <Sparkles className="size-3.5" /> Plus
      </span>
      <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="mt-2 max-w-xl text-[16px] leading-relaxed text-fg-muted">{body}</p>
      {points && (
        <ul className="mt-4 space-y-1.5 text-[15px] text-fg-muted">
          {points.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
      )}
      <ButtonLink to="/studio/upgrade?plan=plus" variant="primary" className="mt-6">
        Upgrade to Plus — €19 / month
      </ButtonLink>
    </div>
  )
}
