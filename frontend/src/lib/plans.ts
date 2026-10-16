/** Subscription plans shown on the landing page. Billing is not active in this build. */
export const SUPPORT_URL = 'https://integrint.hu'

export interface Plan {
  id: 'starter' | 'business' | 'care'
  name: string
  price: string
  period?: string
  blurb: string
  features: string[]
  featured?: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '€19',
    period: '/ month',
    blurb: 'One process, turned into one app.',
    features: ['1 app', '10 recordings a month', 'Small change requests', 'Online link and data export', 'Email support'],
  },
  {
    id: 'business',
    name: 'Business',
    price: '€49',
    period: '/ month',
    blurb: 'For a shop or team with several processes.',
    features: ['5 apps', 'Unlimited re-recording', 'Unlimited small changes', 'Version history and audit trail', 'Priority support from Integrint'],
    featured: true,
  },
  {
    id: 'care',
    name: 'Integrint Care',
    price: 'Custom',
    blurb: 'We record, review and run it with you.',
    features: ['Everything in Business', 'Guided first recording on site', 'Hosting and backups', 'Named support contact'],
  },
]

const PLAN_KEY = 'rc.plan'

/** The plan picked on the pricing page (a per-browser preference; nothing is billed). */
export function chosenPlan(): Plan['id'] {
  try {
    const v = localStorage.getItem(PLAN_KEY)
    return v === 'starter' || v === 'business' ? v : 'business'
  } catch {
    return 'business'
  }
}

export function rememberPlan(id: string | null) {
  if (id !== 'starter' && id !== 'business') return
  try {
    localStorage.setItem(PLAN_KEY, id)
  } catch {
    /* storage unavailable: the default plan is shown */
  }
}
