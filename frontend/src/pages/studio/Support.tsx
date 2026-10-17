import { Link } from 'react-router-dom'
import { ArrowRight, LifeBuoy } from 'lucide-react'
import { SUPPORT_URL } from '../../lib/plans'

const FAQ = [
  {
    q: 'How do I change an app that is already finished?',
    a: 'Open the app and press “Improve this app”, or open it under My apps → Change. Describe the change in one sentence, record the process again, or edit fields, statuses and rules one by one. Every change waits for your approval; the app keeps running meanwhile.',
  },
  {
    q: 'Can I rename the sections of my app?',
    a: 'Yes. In the app: Improve this app → Names & colours. Call each section what your team calls it and give it a colour. Menus, lists and forms use the new names right away.',
  },
  {
    q: 'How do I bring in my existing spreadsheet?',
    a: 'Open a section and press Import. Save the spreadsheet as CSV; the first row holds the column names. Every row is checked by the same rules as the form, and skipped rows are listed with the reason.',
  },
  {
    q: 'Who can do what?',
    a: 'In the Studio, admins add users and the workspace owner manages the plan and billing. Inside an app, turn on Team access to give colleagues personal links as owner, manager, staff or viewer.',
  },
  {
    q: 'The AI misunderstood my video. What now?',
    a: 'Leave out what’s wrong in the review, then ask for a small change or record again with a clearer narration: say out loud what you check and what must never happen. Or ask us, and we’ll help.',
  },
  {
    q: 'Is my video safe?',
    a: 'The video stays on the server that runs Code Your Reality. Only the transcript and a few still frames go to the AI model you configured. Deleting an app deletes its video too.',
  },
]

export default function Support() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Help & support</h1>
      <p className="mt-2 text-[17px] text-fg-muted">Answers to the common questions, and real people when you need them.</p>

      <section className="mt-8 flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-[#00A1FF] to-[#0077BE] p-6 text-white sm:flex-row sm:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20">
          <LifeBuoy className="size-6" />
        </span>
        <div className="flex-1">
          <h2 className="text-[20px] font-semibold">Support by Integrint</h2>
          <p className="mt-1 text-[15px] text-white/85">Stuck with a recording, a change or an import? Tell us what you’re trying to do.</p>
        </div>
        <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-5 text-[15px] font-semibold text-accent">
          Contact Integrint <ArrowRight className="size-4" />
        </a>
      </section>

      <section className="mt-8" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-[21px] font-semibold">
          Frequently asked
        </h2>
        <div className="mt-4 divide-y divide-line-soft overflow-hidden rounded-3xl bg-ink-900">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-[16px] font-medium marker:hidden">
                <span className="flex items-center justify-between gap-3">
                  {f.q}
                  <ArrowRight className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-8 text-center text-[15px] text-fg-muted">
        New here?{' '}
        <Link to="/demo" className="text-accent">
          Try the demo
        </Link>{' '}
        to see the whole journey in two minutes.
      </p>
    </div>
  )
}
