/** Subscription plans. Limits mirror backend/app/services/plans.py. Billing is not live in this build. */
export const SUPPORT_URL = 'https://integrint.hu'

export type PlanId = 'free' | 'plus' | 'business'

export interface Plan {
  id: PlanId | 'care'
  name: string
  price: string
  period?: string
  blurb: string
  features: string[]
  featured?: boolean
  cta: string
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free demo',
    price: '€0',
    blurb: 'Try it with your own process. No card needed.',
    features: ['1 app', '3 video analyses a month', 'Forms, lists and rules', 'Online link and download'],
    cta: 'Start free',
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '€19',
    period: '/ month',
    blurb: 'Turn your demo into the system your team uses every day.',
    features: ['5 apps for your business', 'Deeper analysis (2× more video frames)', 'Reports and dashboards', 'Team access with roles (5 people)', 'Calendar, spreadsheets and webhooks', '30 video analyses a month'],
    featured: true,
    cta: 'Upgrade to Plus',
  },
  {
    id: 'business',
    name: 'Business',
    price: '€49',
    period: '/ month',
    blurb: 'For companies running several processes.',
    features: ['25 apps', 'Team access with roles (25 people per app)', 'Everything in Plus', '200 video analyses a month', 'Priority support from Integrint'],
    cta: 'Choose Business',
  },
  {
    id: 'care',
    name: 'Integrint Care',
    price: 'Custom',
    blurb: 'We record, review and run it with you.',
    features: ['Everything in Business', 'Guided first recording on site', 'Hosting and backups', 'Named support contact'],
    cta: 'Talk to Integrint',
  },
]

export const COMPARISON: { label: string; values: [string, string, string] }[] = [
  { label: 'Apps', values: ['1', '5', '25'] },
  { label: 'Video analyses per month', values: ['3', '30', '200'] },
  { label: 'Video frames the AI studies', values: ['6', '12', '12'] },
  { label: 'Forms, lists, rules, history', values: ['✓', '✓', '✓'] },
  { label: 'Download your data (ZIP, CSV)', values: ['✓', '✓', '✓'] },
  { label: 'Record again and small change requests', values: ['✓', '✓', '✓'] },
  { label: 'Reports and dashboards', values: ['—', '✓', '✓'] },
  { label: 'Team access with roles', values: ['—', '5 people', '25 people'] },
  { label: 'Calendar feed and webhooks', values: ['—', '✓', '✓'] },
  { label: 'Support', values: ['Email', 'Email', 'Priority'] },
]
