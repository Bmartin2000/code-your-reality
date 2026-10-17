import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  ChevronRight,
  Database,
  FlaskConical,
  History,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { api, ApiError, setAppKey } from '../../lib/api'
import { qk } from '../../lib/queries'
import type { AppDetail, AppRecord, Effect, LockedApp, Manifest, ManifestEntity, RecordEvent } from '../../lib/types'
import { BrandMark, EmptyState, ErrorState, LoadingState, ProvenanceBadge, TechnicalLabel } from '../../components/ui/primitives'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/overlays'
import { SchemaForm } from '../../components/app/SchemaForm'
import { FieldValue, Pill, stateLabel, toneFor } from '../../components/app/values'
import { toast } from '../../lib/toast'
import { clockTime, formatValue, relativeTime } from '../../lib/format'
import { cn } from '../../lib/cn'
import type { ProvenanceSource } from '../../lib/workflow-schema'
import { Reports } from '../../components/app/Reports'
import { Connections } from '../../components/app/Connections'
import { Team } from '../../components/app/Team'
import { PlusGate } from '../../components/studio/PlusGate'
import { ArrowDown, ArrowUp, BarChart3, Download, FileText, KeyRound, LayoutGrid, LifeBuoy, Link2, List, MessageSquare, Upload, Users, Wand2 } from 'lucide-react'
import { Invoices, invoicesKey } from '../../components/app/Invoices'
import { NewInvoiceDialog } from '../../components/invoicing/NewInvoiceDialog'
import { Board } from '../../components/app/Board'
import { ImportDialog } from '../../components/app/ImportDialog'
import { ImproveDialog } from '../../components/app/ImproveDialog'
import { SectionTile } from '../../components/app/SectionBadge'
import { sectionColor } from '../../lib/sections'
import { SUPPORT_URL } from '../../lib/plans'

const can = (app: AppDetail, permission: string) => app.viewer.permissions.includes(permission)

// --- data helpers ---------------------------------------------------------------------------

function useInvalidateApp(slug: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: qk.appData(slug) })
}

function describeEffects(manifest: Manifest, effects: Effect[], recordsTitle: (id: string) => string | undefined) {
  return effects
    .map((e) => {
      const rule = manifest.rules.find((r) => r.id === e.rule)
      const name = recordsTitle(e.record)
      return `${name ? `${name}: ` : ''}${e.field.replace(/_/g, ' ')} ${String(e.from ?? '—')} → ${String(e.to)}${rule ? ` (${rule.statement})` : ''}`
    })
    .join(' · ')
}

function useTransition(slug: string, app: AppDetail, entity: ManifestEntity) {
  const invalidate = useInvalidateApp(slug)
  return useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) => api.transition(slug, entity.key, id, key),
    onSuccess: ({ record, effects }, { key }) => {
      const t = entity.state?.transitions.find((x) => x.key === key)
      toast.success(`${t?.label ?? 'Done'} · ${record.code}`, effects.length ? describeEffects(app.manifest, effects, () => undefined) : undefined)
      invalidate()
    },
    onError: (e: ApiError) => {
      toast.error(e.body?.rule ? 'Blocked by a business rule' : 'Transition rejected', e.message)
      invalidate()
    },
  })
}

// --- Create dialog --------------------------------------------------------------------------

function CreateDialog({ slug, app, entity, open, onClose }: { slug: string; app: AppDetail; entity: ManifestEntity; open: boolean; onClose: () => void }) {
  const invalidate = useInvalidateApp(slug)
  const navigate = useNavigate()
  const form = app.manifest.forms.find((f) => f.entity === entity.key)!
  const rules = app.manifest.rules.filter((r) => r.enforced && r.params.entity === entity.key)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`New ${entity.label.toLowerCase()}`}
      description={
        rules.length ? (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {rules.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 text-[12px] text-fg-subtle">
                <ShieldCheck className="size-3 text-accent" />
                {r.statement}
              </span>
            ))}
          </span>
        ) : (
          entity.description
        )
      }
    >
      <SchemaForm
        slug={slug}
        manifest={app.manifest}
        entity={entity}
        fieldKeys={form.create_fields}
        submitLabel={`Create ${entity.label.toLowerCase()}`}
        onCancel={onClose}
        onSubmit={async (payload) => {
          try {
            const { record, effects } = await api.createRecord(slug, entity.key, payload)
            const titles = new Map(Object.values(record.refs).map((r) => [r.id, r.title]))
            toast.success(`${entity.label} ${record.code} created`, effects.length ? describeEffects(app.manifest, effects, (id) => titles.get(id)) : record.title)
            invalidate()
            onClose()
            if (entity.state) navigate(`/apps/${slug}/${entity.key}/${record.id}`)
          } catch (e) {
            invalidate() // a rejection is recorded in the activity log
            throw e
          }
        }}
      />
    </Dialog>
  )
}

// --- Overview -------------------------------------------------------------------------------

const EVENT_STYLE: Record<RecordEvent['kind'], { cls: string; icon: typeof Check }> = {
  created: { cls: 'text-info', icon: Plus },
  updated: { cls: 'text-fg-muted', icon: Pencil },
  transition: { cls: 'text-accent', icon: ArrowRight },
  effect: { cls: 'text-success', icon: Sparkles },
  rejected: { cls: 'text-error', icon: Ban },
  note: { cls: 'text-[#6247C9]', icon: MessageSquare },
}

function ActivityFeed({ events, empty }: { events: RecordEvent[]; empty: string }) {
  if (!events.length) return <p className="text-[13px] text-fg-muted">{empty}</p>
  return (
    <ol className="space-y-3">
      <AnimatePresence initial={false}>
        {events.map((ev) => {
          const s = EVENT_STYLE[ev.kind]
          const rule = (ev.detail as { rule?: { statement: string } } | null)?.rule
          return (
            <motion.li key={ev.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
              <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-ink-950', s.cls)}>
                <s.icon className="size-3" />
              </span>
              <div className="min-w-0">
                {ev.kind === 'note' ? (
                  <p className="whitespace-pre-wrap rounded-xl bg-[#F7F5FE] px-3 py-2 text-[13.5px] leading-snug text-fg">
                    {ev.summary}
                    <span className="mt-1 block text-[11.5px] text-fg-subtle">Note · {String((ev.detail as { author?: string } | null)?.author ?? '')}</span>
                  </p>
                ) : (
                  <p className={cn('text-[13px] leading-snug', ev.kind === 'rejected' ? 'text-error' : 'text-fg-muted')}>{ev.summary}</p>
                )}
                {rule && ev.kind !== 'rejected' && <p className="mt-0.5 text-[11.5px] text-fg-subtle">Rule: {rule.statement}</p>}
                <time className="meta" dateTime={ev.created_at} title={clockTime(ev.created_at)}>
                  {relativeTime(ev.created_at)}
                </time>
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}

function Overview({ slug, app }: { slug: string; app: AppDetail }) {
  const stats = useQuery({ queryKey: qk.stats(slug), queryFn: () => api.appStats(slug) })
  const events = useQuery({ queryKey: qk.events(slug), queryFn: () => api.appEvents(slug, 25) })
  const invalidate = useInvalidateApp(slug)
  const [creating, setCreating] = useState<ManifestEntity | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const seed = useMutation({
    mutationFn: () => api.seedSample(slug),
    onSuccess: (r) => {
      toast.success('Sample records added', `${r.created.item ?? 0} items and ${r.created.customer ?? 0} customers, created through the runtime.`)
      invalidate()
    },
    onError: (e: Error) => toast.error('Could not add sample records', e.message),
  })
  const reset = useMutation({
    mutationFn: () => api.resetApp(slug),
    onSuccess: (r) => {
      toast.success('Application data cleared', `${r.deleted} records deleted.`)
      setConfirmReset(false)
      invalidate()
    },
  })
  const m = app.manifest
  const stateful = m.entities.filter((e) => e.state)
  const total = stats.data ? Object.values(stats.data).reduce((a, b) => a + b.total, 0) : 0

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <TechnicalLabel>Overview</TechnicalLabel>
          <h1 className="display mt-2 text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.05]">{m.workflow.name}</h1>
          {m.workflow.description && <p className="mt-2 max-w-2xl text-[14.5px] text-fg-muted">{m.workflow.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {stateful.map((e) => (
            can(app, 'create') && <Button key={e.key} variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(e)}>
              New {e.label.toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      {stats.isLoading ? (
        <LoadingState />
      ) : stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <>
          {total === 0 && (
            <EmptyState
              icon={<Database className="size-5" />}
              title="No records yet"
              body={app.can_seed_sample ? 'Add the example inventory and customers to try a rental right away, or create your own records.' : 'Create the first records to start operating.'}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {app.can_seed_sample && can(app, 'seed') && (
                    <Button variant="primary" loading={seed.isPending} onClick={() => seed.mutate()} icon={<FlaskConical className="size-4" />}>
                      Add sample records
                    </Button>
                  )}
                  {m.entities
                    .filter((e) => !e.state && can(app, 'create'))
                    .map((e) => (
                      <Button key={e.key} onClick={() => setCreating(e)} icon={<Plus className="size-4" />}>
                        Add {e.label.toLowerCase()}
                      </Button>
                    ))}
                </div>
              }
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {m.entities.map((e) => {
              const s = stats.data![e.key]
              // Prefer the field the workflow itself drives (state, or a field written by effects).
              const effectTarget = m.rules.find((r) => r.enforced && r.kind === 'set_ref_field' && m.entities.find((x) => x.key === r.params.entity)?.fields.some((f) => f.key === r.params.ref_field && f.ref_entity === e.key))?.params.target_field
              const enumField = e.state
                ? e.fields.find((f) => f.key === e.state!.field)
                : e.fields.find((f) => f.key === effectTarget && f.type === 'enum') ?? e.fields.find((f) => f.type === 'enum' && f.options.length <= 6)
              const breakdown = enumField ? s.breakdown[enumField.key] : undefined
              return (
                <Link key={e.key} to={`/apps/${slug}/${e.key}`} className={cn('group rounded-2xl border p-5 transition-colors hover:border-line', sectionColor(e.color).soft, sectionColor(e.color).border)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <SectionTile entity={e} />
                      <span className={cn('truncate text-[16px] font-semibold', sectionColor(e.color).text)}>{e.plural_label}</span>
                    </span>
                    <ChevronRight className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="mt-3 font-mono text-4xl tabular-nums tracking-tight text-fg">{s.total}</p>
                  {breakdown && s.total > 0 && enumField && (
                    <>
                      <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-ink-700" aria-hidden>
                        {Object.entries(breakdown).map(([k, n]) => {
                          const tone = toneFor(e, enumField, k)
                          return n ? <motion.span key={k} layout className={cn('h-full', tone === 'success' ? 'bg-success' : tone === 'active' ? 'bg-accent' : tone === 'warning' ? 'bg-warning' : 'bg-fg-subtle')} style={{ width: `${(n / s.total) * 100}%` }} /> : null
                        })}
                      </div>
                      <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg-muted">
                        {Object.entries(breakdown).map(([k, n]) => (
                          <span key={k}>
                            <span className="font-mono tabular-nums text-fg">{n}</span> {stateLabel(e, enumField, k).toLowerCase()}
                          </span>
                        ))}
                      </p>
                    </>
                  )}
                </Link>
              )
            })}
          </div>

          {stateful.map((e) => (
            <OpenWork key={e.key} slug={slug} app={app} entity={e} />
          ))}
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface rounded-2xl p-5" aria-labelledby="activity">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="activity" className="flex items-center gap-2 text-[15px] font-semibold">
              <History className="size-4 text-fg-subtle" /> Activity
            </h2>
            <TechnicalLabel>Persisted · server</TechnicalLabel>
          </div>
          {events.isLoading ? <LoadingState className="min-h-[120px]" /> : <ActivityFeed events={events.data ?? []} empty="Operations, effects and rule rejections will appear here." />}
        </section>
        <section className="surface rounded-2xl p-5" aria-labelledby="rules">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="rules" className="flex items-center gap-2 text-[15px] font-semibold">
              <ShieldCheck className="size-4 text-fg-subtle" /> Rules in force
            </h2>
            <TechnicalLabel>Compiled from v{m.workflow.version}</TechnicalLabel>
          </div>
          <ul className="space-y-2.5">
            {m.rules.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3">
                <span className={cn('text-[13px] leading-snug', r.enforced ? 'text-fg-muted' : 'text-fg-subtle')}>
                  {r.statement}
                  {!r.enforced && <span className="ml-1.5 font-mono text-[10px] uppercase">documented</span>}
                </span>
                <ProvenanceBadge source={r.source as ProvenanceSource} compact className="shrink-0" />
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line-soft pt-3 text-[12px] text-fg-subtle">Every rule is checked by the server on each operation; the interface cannot bypass it.</p>
        </section>
      </div>

      <div className="flex justify-end">
        {can(app, 'reset') && <Button variant="quiet" size="sm" icon={<RefreshCcw className="size-3.5" />} onClick={() => setConfirmReset(true)}>
          Clear application data
        </Button>}
      </div>

      {creating && <CreateDialog slug={slug} app={app} entity={creating} open={!!creating} onClose={() => setCreating(null)} />}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
        loading={reset.isPending}
        destructive
        title="Clear all application data?"
        description="Every record and the activity history of this application will be permanently deleted. The compiled application itself stays."
        confirmLabel="Delete all records"
      />
    </div>
  )
}

function OpenWork({ slug, app, entity }: { slug: string; app: AppDetail; entity: ManifestEntity }) {
  const records = useQuery({ queryKey: qk.records(slug, entity.key), queryFn: () => api.records(slug, entity.key) })
  const transition = useTransition(slug, app, entity)
  const [confirm, setConfirm] = useState<{ rec: AppRecord; key: string; label: string } | null>(null)
  const stateField = entity.state!.field
  const terminal = new Set(entity.state!.states.filter((s) => s.terminal).map((s) => s.key))
  const open = (records.data ?? []).filter((r) => !terminal.has(String(r.data[stateField])))
  const columns = (app.manifest.views.find((v) => v.entity === entity.key)?.columns ?? []).filter((c) => c !== stateField).slice(0, 4)

  return (
    <section aria-labelledby={`open-${entity.key}`}>
      <div className="mb-3 flex items-end justify-between">
        <h2 id={`open-${entity.key}`} className="text-[15px] font-semibold">
          Open {entity.plural_label.toLowerCase()} <span className="font-mono text-[12px] font-normal text-fg-subtle">{open.length}</span>
        </h2>
        <Link to={`/apps/${slug}/${entity.key}`} className="text-[13px] text-fg-muted hover:text-fg">
          All {entity.plural_label.toLowerCase()}
        </Link>
      </div>
      {records.isLoading ? (
        <LoadingState className="min-h-[100px]" />
      ) : open.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-[13px] text-fg-muted">Nothing open right now.</p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-ink-925">
          <AnimatePresence initial={false}>
            {open.map((r) => (
              <motion.li key={r.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:justify-between">
                  <Link to={`/apps/${slug}/${entity.key}/${r.id}`} className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-fg-subtle">{r.code}</span>
                      <Pill tone={toneFor(entity, entity.fields.find((f) => f.key === stateField)!, String(r.data[stateField]))}>{stateLabel(entity, entity.fields.find((f) => f.key === stateField)!, String(r.data[stateField]))}</Pill>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-fg-muted">
                      {columns.map((c) => {
                        const f = entity.fields.find((x) => x.key === c)!
                        return (
                          <span key={c}>
                            <span className="text-fg-subtle">{f.label}: </span>
                            {f.type === 'reference' ? r.refs[c]?.title ?? '—' : formatValue(f.type, r.data[c])}
                          </span>
                        )
                      })}
                    </span>
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    {can(app, 'transition') && r.transitions.map((t) => (
                      <Button key={t.key} size="sm" onClick={() => setConfirm({ rec: r, key: t.key, label: t.label })} loading={transition.isPending && transition.variables?.id === r.id} icon={<Check className="size-3.5" />}>
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        loading={transition.isPending}
        onConfirm={() => confirm && transition.mutate({ id: confirm.rec.id, key: confirm.key }, { onSettled: () => setConfirm(null) })}
        title={`${confirm?.label} · ${confirm?.rec.code}`}
        description={
          <>
            {entity.state?.transitions.find((t) => t.key === confirm?.key)?.description || 'This moves the record to its next state.'}
            {(app.manifest.effects[entity.key]?.[confirm?.key ?? ''] ?? []).length > 0 && (
              <span className="mt-3 block rounded-lg border border-line-soft bg-ink-925 px-3 py-2 text-[12.5px]">
                Effects:{' '}
                {(app.manifest.effects[entity.key][confirm!.key] ?? []).map((id) => app.manifest.rules.find((r) => r.id === id)?.statement).join(' · ')}
              </span>
            )}
          </>
        }
        confirmLabel={confirm?.label ?? 'Confirm'}
      />
    </section>
  )
}

// --- List -----------------------------------------------------------------------------------

function EntityList({ slug, app }: { slug: string; app: AppDetail }) {
  const { entity: key } = useParams()
  const entity = app.manifest.entities.find((e) => e.key === key)
  const records = useQuery({ queryKey: qk.records(slug, key ?? ''), queryFn: () => api.records(slug, key!), enabled: !!entity })
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [mode, setMode] = useState<'list' | 'board'>(() => (storageGet(`cyr.view.${slug}.${key}`) === 'board' ? 'board' : 'list'))
  const [filter, setFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const navigate = useNavigate()
  const invalidate = useInvalidateApp(slug)
  const transition = useTransition(slug, app, entity ?? app.manifest.entities[0])
  const [confirm, setConfirm] = useState<{ rec: AppRecord; key: string; label: string } | null>(null)
  // Filter by the status for workflow sections, otherwise by a short list of options.
  const filterField = entity ? (entity.state ? entity.fields.find((f) => f.key === entity.state!.field) : entity.fields.find((f) => f.type === 'enum' && f.options.length <= 8)) : undefined

  const rows = useMemo(() => {
    const needle = q.toLowerCase()
    let out = (records.data ?? []).filter((r) => !q || JSON.stringify([r.title, r.code, r.data, Object.values(r.refs).map((x) => x.title)]).toLowerCase().includes(needle))
    if (filter && filterField) out = out.filter((r) => String(r.data[filterField.key]) === filter)
    if (sort) {
      const value = (r: AppRecord) => (r.refs[sort.key]?.title ?? r.data[sort.key] ?? '') as string | number
      out = [...out].sort((a, b) => {
        const x = value(a)
        const y = value(b)
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir
      })
    }
    return out
  }, [records.data, q, filter, filterField, sort])
  if (!entity) return <EmptyState title="Unknown view" body="This application has no such section." action={<ButtonLink to={`/apps/${slug}`}>Back to overview</ButtonLink>} />
  const view = app.manifest.views.find((v) => v.entity === entity.key)
  const columns = (view?.columns ?? []).map((c) => entity.fields.find((f) => f.key === c)!).filter(Boolean)
  const color = sectionColor(entity.color)
  const all = records.data ?? []
  const counts: Record<string, number> = filterField ? Object.fromEntries(filterField.options.map((o) => [o, all.filter((r) => String(r.data[filterField.key]) === o).length])) : {}
  const switchMode = (m: 'list' | 'board') => {
    setMode(m)
    storageSet(`cyr.view.${slug}.${entity.key}`, m)
  }
  const sortBy = (k: string) => setSort((s) => (s?.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }))

  return (
    <div>
      <div className={cn('flex flex-col gap-4 rounded-3xl border p-5 md:flex-row md:items-center md:justify-between', color.soft, color.border)}>
        <div className="flex min-w-0 items-center gap-4">
          <SectionTile entity={entity} size="lg" />
          <div className="min-w-0">
            <h1 className="display truncate text-[clamp(1.7rem,3vw,2.4rem)] leading-[1.05]">{entity.plural_label}</h1>
            <p className="mt-1 text-[14px] text-fg-muted">
              {all.length} {all.length === 1 ? entity.label.toLowerCase() : entity.plural_label.toLowerCase()}
              {entity.description ? ` · ${entity.description}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(app, 'seed') && (
            <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              Import
            </Button>
          )}
          <a href={api.csvUrl(`/api/apps/${slug}/export/${entity.key}.csv`, slug)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-medium text-fg ring-1 ring-line-soft hover:ring-line">
            <Download className="size-4" /> Export
          </a>
          {can(app, 'create') && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New {entity.label.toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
          {filterField && (
            <>
              <button onClick={() => setFilter(null)} aria-pressed={!filter} className={cn('rounded-full px-3 py-1.5 text-[13px] font-medium', !filter ? 'bg-fg text-white' : 'bg-ink-900 text-fg-muted hover:text-fg')}>
                All <span className="opacity-70">{all.length}</span>
              </button>
              {filterField.options.map((o) => (
                <button key={o} onClick={() => setFilter(filter === o ? null : o)} aria-pressed={filter === o} className={cn('rounded-full px-3 py-1.5 text-[13px] font-medium', filter === o ? 'bg-fg text-white' : 'bg-ink-900 text-fg-muted hover:text-fg')}>
                  {stateLabel(entity, filterField, o)} <span className="opacity-70">{counts[o]}</span>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input className="field-input w-full pl-8 lg:w-60" placeholder={`Search ${entity.plural_label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${entity.plural_label}`} />
          </label>
          {entity.state && (
            <div className="flex shrink-0 rounded-full bg-ink-900 p-1" role="group" aria-label="Layout">
              <button onClick={() => switchMode('list')} aria-pressed={mode === 'list'} className={cn('flex items-center gap-1 rounded-full px-3 text-[13px] font-medium', mode === 'list' ? 'bg-white text-fg shadow-sm' : 'text-fg-muted')}>
                <List className="size-4" /> List
              </button>
              <button onClick={() => switchMode('board')} aria-pressed={mode === 'board'} className={cn('flex items-center gap-1 rounded-full px-3 text-[13px] font-medium', mode === 'board' ? 'bg-white text-fg shadow-sm' : 'text-fg-muted')}>
                <LayoutGrid className="size-4" /> Board
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-5">
        {records.isLoading ? (
          <LoadingState />
        ) : records.isError ? (
          <ErrorState error={records.error} onRetry={() => records.refetch()} />
        ) : entity.state && mode === 'board' && all.length > 0 ? (
          <Board slug={slug} entity={entity} rows={rows} columns={columns.map((c) => c.key)} canMove={can(app, 'transition')} onMove={(rec, k, label) => setConfirm({ rec, key: k, label })} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Database className="size-5" />}
            title={q || filter ? 'No matches' : `No ${entity.plural_label.toLowerCase()} yet`}
            body={q || filter ? 'Try a different search or filter.' : entity.description}
            action={!q && can(app, 'create') && <Button variant="primary" onClick={() => setCreating(true)} icon={<Plus className="size-4" />}>Create the first one</Button>}
          />
        ) : (
          <>
            {/* table ≥ md */}
            <div className="hidden overflow-x-auto rounded-2xl border border-line-soft md:block">
              <table className="w-full min-w-[640px] text-left text-[13.5px]">
                <thead className="bg-ink-925">
                  <tr className="border-b border-line-soft">
                    <th scope="col" className="meta px-4 py-3 font-normal">ID</th>
                    {columns.map((c) => (
                      <th key={c.key} scope="col" className="meta px-4 py-3 font-normal" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                        <button onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-fg">
                          {c.label}
                          {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                        </button>
                      </th>
                    ))}
                    {entity.state && <th scope="col" className="sr-only">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {rows.map((r) => (
                      <motion.tr
                        key={r.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => navigate(`/apps/${slug}/${entity.key}/${r.id}`)}
                        className="cursor-pointer border-b border-line-soft bg-ink-950 transition-colors last:border-0 hover:bg-ink-900"
                      >
                        <td className="px-4 py-3">
                          <Link to={`/apps/${slug}/${entity.key}/${r.id}`} className="font-mono text-[11.5px] text-fg-subtle hover:text-fg" onClick={(e) => e.stopPropagation()}>
                            {r.code}
                          </Link>
                        </td>
                        {columns.map((c) => (
                          <td key={c.key} className="px-4 py-3 text-fg">
                            <FieldValue slug={slug} entity={entity} field={c} record={r} />
                          </td>
                        ))}
                        {entity.state && (
                          <td className="px-4 py-2 text-right">
                            {can(app, 'transition') && r.transitions.map((t) => (
                              <Button
                                key={t.key}
                                size="sm"
                                variant="quiet"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirm({ rec: r, key: t.key, label: t.label })
                                }}
                              >
                                {t.label}
                              </Button>
                            ))}
                          </td>
                        )}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            {/* cards < md */}
            <ul className="space-y-2 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link to={`/apps/${slug}/${entity.key}/${r.id}`} className="surface block rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-medium text-fg">{r.title}</span>
                      <span className="font-mono text-[11px] text-fg-subtle">{r.code}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                      {columns.slice(0, 4).map((c) => (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-fg-subtle">{c.label}</dt>
                          <dd className="truncate text-fg">
                            <FieldValue slug={slug} entity={entity} field={c} record={r} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <CreateDialog slug={slug} app={app} entity={entity} open={creating} onClose={() => setCreating(false)} />
      <ImportDialog slug={slug} entity={entity} open={importing} onClose={() => setImporting(false)} onDone={invalidate} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        loading={transition.isPending}
        onConfirm={() => confirm && transition.mutate({ id: confirm.rec.id, key: confirm.key }, { onSettled: () => setConfirm(null) })}
        title={`${confirm?.label} · ${confirm?.rec.code}`}
        description={entity.state?.transitions.find((t) => t.key === confirm?.key)?.description || 'This moves the record to its next state.'}
        confirmLabel={confirm?.label ?? 'Confirm'}
      />
    </div>
  )
}

// --- Detail ---------------------------------------------------------------------------------

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}

/** CRM-style note on a record: calls, agreements, reminders. Notes never change data or rules. */
function NoteComposer({ slug, entity, id, onSaved }: { slug: string; entity: string; id: string; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await api.addNote(slug, entity, id, text.trim())
      setText('')
      onSaved()
    } catch (err) {
      toast.error('Could not save the note', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="mb-5">
      <label htmlFor="note" className="sr-only">
        Add a note
      </label>
      <textarea id="note" className="field-input min-h-[72px] text-[14px]" placeholder="Add a note: a call, an agreement, a reminder…" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!text.trim()} icon={<MessageSquare className="size-3.5" />}>
          Add note
        </Button>
      </div>
    </form>
  )
}

function RecordDetail({ slug, app }: { slug: string; app: AppDetail }) {
  const { entity: key, id } = useParams()
  const entity = app.manifest.entities.find((e) => e.key === key)
  const q = useQuery({ queryKey: qk.record(slug, key ?? '', id ?? ''), queryFn: () => api.record(slug, key!, id!), enabled: !!entity && !!id })
  const transition = useTransition(slug, app, entity ?? app.manifest.entities[0])
  const invalidate = useInvalidateApp(slug)
  const [editing, setEditing] = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const qc = useQueryClient()
  const invoiceCfg = useQuery({ queryKey: invoicesKey(slug), queryFn: () => api.appInvoices(slug), enabled: invoicing })
  const [confirm, setConfirm] = useState<{ key: string; label: string } | null>(null)

  if (!entity) return <EmptyState title="Unknown record type" />
  if (q.isLoading) return <LoadingState />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const { record, history } = q.data!
  const form = app.manifest.forms.find((f) => f.entity === entity.key)!
  const stateField = entity.state?.field
  const stateDef = stateField ? entity.fields.find((f) => f.key === stateField) : undefined
  const rules = app.manifest.rules.filter((r) => r.enforced && r.params.entity === entity.key)
  const affectedBy = app.manifest.rules.filter((r) => r.kind === 'set_ref_field' && app.manifest.entities.find((e) => e.key === r.params.entity)?.fields.some((f) => f.key === r.params.ref_field && f.ref_entity === entity.key))

  return (
    <div>
      <Link to={`/apps/${slug}/${entity.key}`} className={cn('inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium', sectionColor(entity.color).tile)}>
        <SectionTile entity={entity} size="sm" className="bg-white/70" />
        <ArrowLeft className="size-3.5" /> {entity.plural_label}
      </Link>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-fg-subtle">{record.code}</span>
            {stateDef && <Pill tone={toneFor(entity, stateDef, String(record.data[stateField!]))}>{stateLabel(entity, stateDef, String(record.data[stateField!]))}</Pill>}
          </div>
          <h1 className="display mt-2 truncate text-[clamp(1.7rem,3vw,2.4rem)] leading-[1.05]">{record.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(app, 'transition') && record.transitions.map((t) => (
            <Button key={t.key} variant="primary" onClick={() => setConfirm(t)} icon={<Check className="size-4" />}>
              {t.label}
            </Button>
          ))}
          {form.edit_fields.length > 0 && can(app, 'update') && (
            <Button onClick={() => setEditing(true)} icon={<Pencil className="size-3.5" />}>
              Edit
            </Button>
          )}
          {can(app, 'update') && app.features.invoicing && (
            <Button onClick={() => setInvoicing(true)} icon={<FileText className="size-3.5" />}>
              Invoice
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <section className="surface rounded-2xl p-5 lg:col-span-7" aria-label="Details">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {entity.fields.map((f) => (
              <div key={f.key} className={cn(f.type === 'long_text' && 'sm:col-span-2')}>
                <dt className="meta">{f.label}</dt>
                <dd className="mt-1.5 text-[14px] text-fg">
                  <FieldValue slug={slug} entity={entity} field={f} record={record} />
                </dd>
              </div>
            ))}
          </dl>
          {(rules.length > 0 || affectedBy.length > 0) && (
            <div className="mt-6 border-t border-line-soft pt-4">
              <TechnicalLabel className="mb-2 block">Rules governing this record</TechnicalLabel>
              <ul className="space-y-1.5">
                {[...rules, ...affectedBy].map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-[13px] text-fg-muted">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    {r.statement}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="surface rounded-2xl p-5 lg:col-span-5" aria-label="Notes and history">
          <TechnicalLabel className="mb-4 block">Notes & history</TechnicalLabel>
          {can(app, 'create') && <NoteComposer slug={slug} entity={entity.key} id={record.id} onSaved={() => q.refetch()} />}
          <ActivityFeed events={history} empty="No history yet." />
        </section>
      </div>

      {invoicing && invoiceCfg.data && (
        <NewInvoiceDialog
          slug={slug}
          config={invoiceCfg.data.config}
          from={{ entity: entity.key, id: record.id }}
          open={invoicing}
          onClose={() => setInvoicing(false)}
          onCreated={(inv) => {
            setInvoicing(false)
            qc.invalidateQueries({ queryKey: invoicesKey(slug) })
            q.refetch()
            if (inv.status === 'failed') toast.error('Saved, but not issued', inv.error ?? undefined)
            else toast.success(inv.status === 'issued' ? `Invoice ${inv.number} issued` : `Draft ${inv.draft_number} saved`, 'You’ll find it under Invoices.')
          }}
        />
      )}
      <Dialog open={editing} onClose={() => setEditing(false)} title={`Edit ${record.code}`} wide description="Fields owned by the workflow (states and values set by rules) can't be edited by hand.">
        <SchemaForm
          slug={slug}
          manifest={app.manifest}
          entity={entity}
          fieldKeys={form.edit_fields}
          record={record}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            await api.updateRecord(slug, entity.key, record.id, payload)
            toast.success(`${record.code} updated`)
            invalidate()
            setEditing(false)
          }}
        />
      </Dialog>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        loading={transition.isPending}
        onConfirm={() => confirm && transition.mutate({ id: record.id, key: confirm.key }, { onSettled: () => setConfirm(null) })}
        title={`${confirm?.label} · ${record.code}`}
        description={
          <>
            {entity.state?.transitions.find((t) => t.key === confirm?.key)?.description || 'This moves the record to its next state.'}
            {(app.manifest.effects[entity.key]?.[confirm?.key ?? ''] ?? []).length > 0 && (
              <span className="mt-3 block rounded-lg border border-line-soft bg-ink-925 px-3 py-2 text-[12.5px]">
                Effects: {(app.manifest.effects[entity.key][confirm!.key] ?? []).map((rid) => app.manifest.rules.find((r) => r.id === rid)?.statement).join(' · ')}
              </span>
            )}
          </>
        }
        confirmLabel={confirm?.label ?? 'Confirm'}
      />
    </div>
  )
}

// --- Shell ----------------------------------------------------------------------------------

function LockedScreen({ app, onKey }: { app: LockedApp; onKey: (key: string) => void }) {
  const [value, setValue] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const m = value.match(/[?&]key=([a-f0-9]+)/i)
    onKey((m ? m[1] : value).trim())
  }
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-ink-900 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-[0_20px_60px_-30px_rgba(11,27,38,0.3)]">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-accent">
          <KeyRound className="size-7" />
        </span>
        <h1 className="mt-5 text-[24px] font-semibold">{app.name}</h1>
        <p className="mt-2 text-[15px] text-fg-muted">This app is private. Open it with the personal link you received, or paste the link here.</p>
        <input className="field-input mt-6" placeholder="Paste your personal link" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Personal link" />
        <Button type="submit" variant="primary" className="mt-3 w-full" disabled={!value.trim()}>
          Open app
        </Button>
      </form>
    </main>
  )
}

export default function GeneratedAppPage() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const linkKey = params.get('key')
  useEffect(() => {
    // Personal links carry ?key=…; remember it for this app on this device and tidy the URL.
    if (linkKey) {
      setAppKey(slug, linkKey)
      params.delete('key')
      setParams(params, { replace: true })
      qc.invalidateQueries({ queryKey: qk.app(slug) })
      qc.invalidateQueries({ queryKey: qk.appData(slug) })
    }
  }, [linkKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const app = useQuery({ queryKey: qk.app(slug), queryFn: () => api.app(slug), enabled: !linkKey })
  const [improving, setImproving] = useState(false)

  if (app.isLoading || linkKey) return <LoadingState className="min-h-dvh" label="Starting application" />
  if (app.isError)
    return (
      <main id="main" className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <ErrorState error={app.error} onRetry={(app.error as ApiError).status === 404 ? undefined : () => app.refetch()} />
          <div className="mt-4 text-center">
            <Link to="/studio/apps" className="text-sm text-fg-muted hover:text-fg">
              Back to applications
            </Link>
          </div>
        </div>
      </main>
    )
  if (app.data!.locked)
    return (
      <LockedScreen
        app={app.data as LockedApp}
        onKey={(key) => {
          setAppKey(slug, key)
          qc.invalidateQueries({ queryKey: qk.app(slug) })
        }}
      />
    )
  const a = app.data as AppDetail
  const extra = [
    { key: 'invoices', label: 'Invoices', icon: FileText, show: can(a, 'update'), plus: !a.features.invoicing },
    { key: 'reports', label: 'Reports', icon: BarChart3, show: can(a, 'reports'), plus: !a.features.reports },
    { key: 'connections', label: 'Connections', icon: Link2, show: can(a, 'admin'), plus: !a.features.integrations },
    { key: 'team', label: 'Team', icon: Users, show: can(a, 'admin'), plus: !a.features.team },
  ].filter((x) => x.show)
  const sections = a.manifest.views
    .filter((v) => v.entity)
    .map((v) => ({ key: v.key, label: v.label, to: `/apps/${slug}/${v.entity}`, entity: a.manifest.entities.find((e) => e.key === v.entity)! }))
  const nav = [
    { key: 'overview', label: 'Overview', to: `/apps/${slug}`, end: true, icon: LayoutDashboard, plus: false },
    ...sections.map((v) => ({ key: v.key, label: v.label, to: v.to, end: false, icon: Database, plus: false })),
    ...extra.map((x) => ({ key: x.key, label: x.label, to: `/apps/${slug}/${x.key}`, end: true, icon: x.icon, plus: x.plus })),
  ]
  const roleLabel = { owner: 'Owner', manager: 'Manager', staff: 'Staff', viewer: 'Viewer' }[a.viewer.role]

  return (
    <div className="min-h-dvh bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#00A1FF] to-[#0077BE] font-[Poppins] text-[13px] font-semibold text-white">{a.name.slice(0, 1)}</span>
            <span className="truncate text-[15px] font-semibold">{a.name}</span>
            {a.is_sample && (
              <span className="hidden items-center gap-1 rounded-full bg-[#FBF1DC] px-2 py-0.5 text-[11px] font-medium text-warning sm:inline-flex">
                <FlaskConical className="size-3" /> Example
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {a.access_mode === 'team' && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-accent" title="Your role in this app">
                {a.viewer.name ? `${a.viewer.name} · ` : ''}
                {roleLabel}
              </span>
            )}
            {can(a, 'admin') && (
              <Button size="sm" variant="primary" icon={<Wand2 className="size-4" />} onClick={() => setImproving(true)}>
                <span className="hidden sm:inline">Improve this app</span>
                <span className="sm:hidden">Improve</span>
              </Button>
            )}
            {can(a, 'admin') && (
              <Link to={`/studio/projects/${a.project_id}`} className="flex items-center gap-2 rounded-full border border-line-soft px-2.5 py-1 text-[12px] text-fg-muted hover:border-line hover:text-fg" title="Open the source workflow in Code Your Reality">
                <BrandMark withWord={false} className="[&_svg]:size-4" />
                <span className="hidden sm:inline">Source v{a.workflow_version}</span>
              </Link>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 pb-2 sm:px-6 lg:hidden" aria-label="Application sections">
          {nav.map((v) => (
            <NavLink key={v.key} to={v.to} end={v.end} className={({ isActive }) => cn('h-9 shrink-0 rounded-full px-3.5 text-[14px] leading-9', isActive ? 'bg-fg text-white' : 'text-fg-muted')}>
              {v.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[210px_1fr] lg:px-8 lg:py-10">
        <nav className="hidden lg:block" aria-label="Application sections">
          <div className="sticky top-24 space-y-5">
            <NavLink to={`/apps/${slug}`} end className={({ isActive }) => cn('flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium transition-colors', isActive ? 'bg-brand-50 text-accent' : 'text-fg-muted hover:bg-ink-900 hover:text-fg')}>
              <LayoutDashboard className="size-4" /> Overview
            </NavLink>
            <div>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Sections</p>
              <ul className="space-y-1">
                {sections.map((v) => (
                  <li key={v.key}>
                    <NavLink to={v.to} className={({ isActive }) => cn('flex items-center gap-3 rounded-2xl p-2 text-[15px] font-semibold transition-colors', isActive ? cn(sectionColor(v.entity.color).soft, sectionColor(v.entity.color).text, 'ring-1', sectionColor(v.entity.color).border.replace('border-', 'ring-')) : 'text-fg hover:bg-ink-900')}>
                      <SectionTile entity={v.entity} />
                      <span className="truncate">{v.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
            {extra.length > 0 && (
              <ul className="space-y-0.5 border-t border-line-soft pt-4">
                {extra.map((v) => (
                  <li key={v.key}>
                    <NavLink to={`/apps/${slug}/${v.key}`} end className={({ isActive }) => cn('flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] transition-colors', isActive ? 'bg-brand-50 font-medium text-accent' : 'text-fg-muted hover:bg-ink-900 hover:text-fg')}>
                      <v.icon className="size-4" />
                      {v.label}
                      {v.plus && <span className="ml-auto rounded-full bg-fg px-1.5 py-0.5 text-[10px] font-semibold text-white">Plus</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] text-fg-muted hover:bg-ink-900 hover:text-fg">
              <LifeBuoy className="size-4" /> Help & support
            </a>
          </div>
        </nav>
        <main id="main" className="min-w-0">
          {can(a, 'admin') && <ImproveDialog key={improving ? 'open' : 'closed'} app={a} open={improving} onClose={() => setImproving(false)} />}
          <Routes>
            <Route index element={<Overview slug={slug} app={a} />} />
            <Route path="reports" element={a.features.reports ? <Reports slug={slug} /> : <ReportsGate />} />
            <Route path="invoices" element={a.features.invoicing ? <Invoices slug={slug} app={a} /> : <InvoicesGate />} />
            <Route path="connections" element={<Connections slug={slug} />} />
            <Route path="team" element={<Team slug={slug} />} />
            <Route path=":entity" element={<EntityList slug={slug} app={a} />} />
            <Route path=":entity/:id" element={<RecordDetail slug={slug} app={a} />} />
          </Routes>
          <footer className="mt-16 flex flex-col items-center justify-between gap-2 border-t border-line-soft pt-5 text-[12.5px] text-fg-subtle sm:flex-row">
            <span>Made with Code Your Reality · business rules checked on the server</span>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="hover:text-accent">
              Support by Integrint
            </a>
          </footer>
        </main>
      </div>
    </div>
  )
}

function InvoicesGate() {
  return (
    <div>
      <h1 className="display mb-6 text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.08]">Invoices</h1>
      <PlusGate
        title="Invoice your customers from your app"
        body="Plus lets you invoice straight from a record (for example a rental): the customer and amounts are filled in for you. Connect your own Számlázz.hu account to issue real invoices and email them automatically."
      />
    </div>
  )
}

function ReportsGate() {
  return (
    <div>
      <h1 className="display mb-6 text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.08]">Reports</h1>
      <PlusGate
        title="See how your business is doing"
        body="Plus adds reports calculated from your records: what’s open and overdue, totals like deposits, your busiest items, and how many mistakes your rules prevented."
      />
    </div>
  )
}
