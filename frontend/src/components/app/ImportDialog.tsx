import { useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Dialog } from '../ui/overlays'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import type { ImportResult, ManifestEntity } from '../../lib/types'

/** Minimal CSV parser: quoted fields, escaped quotes, comma or semicolon (Excel in many EU locales). */
const BOM = String.fromCharCode(0xfeff)

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.startsWith(BOM) ? text.slice(1) : text
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()))
  if (!header) return []
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

export function ImportDialog({ slug, entity, open, onClose, onDone }: { slug: string; entity: ManifestEntity; open: boolean; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const columns = entity.fields.filter((f) => !f.system && !(entity.state && entity.state.field === f.key))

  const reset = () => (setRows(null), setFileName(''), setResult(null), setError(null))
  const close = () => (reset(), onClose())

  const pick = async (file: File | undefined) => {
    if (!file) return
    reset()
    setFileName(file.name)
    const parsed = parseCsv(await file.text())
    if (!parsed.length) setError('No rows found. The first line should hold the column names.')
    else if (parsed.length > 500) setError('Up to 500 rows at a time. Split the file and import it in parts.')
    else setRows(parsed)
  }

  const run = async () => {
    if (!rows) return
    setBusy(true)
    try {
      const r = await api.importRecords(slug, entity.key, rows)
      setResult(r)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const template = () => {
    const csv = BOM + columns.map((f) => `"${f.label}"`).join(',') + '\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${entity.plural_label.toLowerCase().replace(/\s+/g, '-')}-template.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Dialog open={open} onClose={close} title={`Import ${entity.plural_label.toLowerCase()}`} description="From a spreadsheet saved as CSV. Every row is checked by the same rules as the form; rows that break a rule are skipped and listed.">
      {result ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-[#E7F6EA] p-4 text-[15px] text-success">
            {result.created} {result.created === 1 ? entity.label.toLowerCase() : entity.plural_label.toLowerCase()} imported{result.failed ? `, ${result.failed} skipped` : ''}.
          </p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-ink-900 p-3 text-[13px]">
              {result.errors.map((e) => (
                <li key={e.row}>
                  <span className="font-medium">Row {e.row}:</span> <span className="text-fg-muted">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={reset}>Import another file</Button>
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-ink-900 p-4 text-[13.5px] text-fg-muted">
            <p className="font-medium text-fg">Columns</p>
            <p className="mt-1">{columns.map((f) => f.label).join(' · ')}</p>
            <p className="mt-2">Linked records can be written by name or code, e.g. “ITE-0001”.</p>
            <button className="mt-2 font-medium text-accent" onClick={template}>
              Download an empty template
            </button>
          </div>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-8 text-center hover:border-accent">
            <FileSpreadsheet className="size-7 text-accent" />
            <span className="text-[15px] font-medium">{fileName || 'Choose a CSV file'}</span>
            {rows && <span className="text-[13px] text-fg-muted">{rows.length} rows ready</span>}
            <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {error && (
            <p role="alert" className="text-[14px] text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!rows} loading={busy} onClick={run} icon={<Upload className="size-4" />}>
              Import {rows ? rows.length : ''} rows
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
