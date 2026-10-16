import { useMemo } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import type { AppRecord, Manifest, ManifestEntity, ManifestField } from '../../lib/types'
import { api, ApiError } from '../../lib/api'
import { qk } from '../../lib/queries'
import { todayIso } from '../../lib/format'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^[+()0-9 .\-/]{5,32}$/

function fieldSchema(f: ManifestField) {
  return z.string().superRefine((raw, ctx) => {
    const v = raw.trim()
    if (!v) {
      if (f.required) ctx.addIssue({ code: 'custom', message: `${f.label} is required.` })
      return
    }
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message })
    if ((f.type === 'number' || f.type === 'money') && !Number.isFinite(Number(v.replace(/,/g, '')))) bad('Enter a number.')
    if (f.type === 'email' && !EMAIL.test(v)) bad('Enter a valid email address.')
    if (f.type === 'phone' && !PHONE.test(v)) bad('Enter a valid phone number.')
    if (f.type === 'date' && Number.isNaN(Date.parse(v))) bad('Enter a valid date.')
    if (f.type === 'text' && v.length > 300) bad('Keep this under 300 characters.')
    if (f.type === 'enum' && !f.options.includes(v)) bad(`Choose one of: ${f.options.join(', ')}.`)
  })
}

function toPayload(fields: ManifestField[], values: Record<string, string>) {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = (values[f.key] ?? '').trim()
    if (v === '') out[f.key] = null
    else if (f.type === 'number' || f.type === 'money') out[f.key] = Number(v.replace(/,/g, ''))
    else if (f.type === 'boolean') out[f.key] = v === 'true'
    else out[f.key] = v
  }
  return out
}

function initial(f: ManifestField, record?: AppRecord): string {
  const v = record?.data[f.key]
  if (v != null) return String(v)
  if (record) return ''
  if (f.default === '$today') return todayIso()
  if (f.default != null) return String(f.default)
  if (f.type === 'boolean') return 'false'
  return ''
}

function RefSelect({ slug, f, manifest, registration, id, invalid, describedBy }: { slug: string; f: ManifestField; manifest: Manifest; registration: UseFormRegisterReturn; id: string; invalid: boolean; describedBy?: string }) {
  const target = manifest.entities.find((e) => e.key === f.ref_entity)!
  const { data, isLoading } = useQuery({ queryKey: qk.records(slug, target.key), queryFn: () => api.records(slug, target.key) })
  // Surface the condition a guard rule checks (e.g. availability) so the choice is informed.
  const guardField = useMemo(() => {
    for (const r of manifest.rules) if (r.kind === 'ref_field_equals' && r.params.ref_field === f.key && r.enforced) return { field: String(r.params.target_field), equals: String(r.params.equals) }
    return null
  }, [manifest.rules, f.key])
  const sorted = useMemo(() => {
    const list = [...(data ?? [])].sort((a, b) => a.title.localeCompare(b.title))
    if (guardField) list.sort((a, b) => Number(b.data[guardField.field] === guardField.equals) - Number(a.data[guardField.field] === guardField.equals))
    return list
  }, [data, guardField])
  return (
    <select id={id} {...registration} className="field-input" aria-invalid={invalid || undefined} aria-describedby={describedBy} disabled={isLoading}>
      <option value="">{isLoading ? 'Loading…' : sorted.length ? `Choose ${target.label.toLowerCase()}` : `No ${target.plural_label.toLowerCase()} yet`}</option>
      {sorted.map((r) => {
        const blocked = guardField && r.data[guardField.field] !== guardField.equals
        return (
          <option key={r.id} value={r.id}>
            {r.title} · {r.code}
            {blocked ? ` — ${String(r.data[guardField!.field])}` : ''}
          </option>
        )
      })}
    </select>
  )
}

export function SchemaForm({
  slug,
  manifest,
  entity,
  fieldKeys,
  record,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  slug: string
  manifest: Manifest
  entity: ManifestEntity
  fieldKeys: string[]
  record?: AppRecord
  submitLabel: string
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>
  onCancel?: () => void
}) {
  const fields = fieldKeys.map((k) => entity.fields.find((f) => f.key === k)!).filter(Boolean)
  const schema = useMemo(() => z.object(Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)]))), [fields])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(fields.map((f) => [f.key, initial(f, record)])),
  })
  const formError = errors.root?.message

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toPayload(fields, values))
    } catch (e) {
      const err = e as ApiError
      const fe = err.body?.field_errors ?? {}
      for (const [k, msg] of Object.entries(fe)) if (fields.some((f) => f.key === k)) setError(k, { message: msg })
      setError('root', { message: err.body?.rule ? `Rule enforced: ${err.message}` : err.message })
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && (
        <div role="alert" className="rounded-xl border border-error/30 bg-error/[0.06] px-3.5 py-3 text-[13px] leading-relaxed text-error">
          {formError}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `f-${entity.key}-${f.key}`
          const err = errors[f.key]?.message
          const describedBy = err ? `${id}-err` : undefined
          const reg = register(f.key)
          const full = f.type === 'long_text'
          return (
            <div key={f.key} className={cn(full && 'sm:col-span-2')}>
              <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-fg">
                  {f.label}
                  {f.required && <span className="ml-0.5 text-accent">*</span>}
                </span>
                {f.type === 'money' && <span className="font-mono text-[10.5px] text-fg-subtle">amount</span>}
              </label>
              {f.type === 'reference' ? (
                <RefSelect slug={slug} f={f} manifest={manifest} registration={reg} id={id} invalid={!!err} describedBy={describedBy} />
              ) : f.type === 'enum' ? (
                <select id={id} {...reg} className="field-input" aria-invalid={!!err || undefined} aria-describedby={describedBy}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === 'boolean' ? (
                <select id={id} {...reg} className="field-input">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : f.type === 'long_text' ? (
                <textarea id={id} {...reg} className="field-input min-h-[88px] resize-y" aria-invalid={!!err || undefined} aria-describedby={describedBy} />
              ) : (
                <input
                  id={id}
                  {...reg}
                  className="field-input"
                  type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
                  inputMode={f.type === 'number' || f.type === 'money' ? 'decimal' : undefined}
                  aria-invalid={!!err || undefined}
                  aria-describedby={describedBy}
                  autoComplete="off"
                />
              )}
              {err && (
                <p id={`${id}-err`} className="mt-1 text-[12px] text-error">
                  {err}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
