import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ban, Check, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Homepage preview of the compiled rental application.
 * It runs the same three compiled rule kinds as the server runtime (precondition, exclusivity,
 * effects) in the browser, on throwaway in-memory data, so visitors can try it instantly.
 * The real application in the Studio persists records server-side.
 */
type Item = { id: string; name: string; availability: 'available' | 'rented' }
type Rental = { id: string; item: string; customer: string; status: 'active' | 'returned' }

const ITEMS: Item[] = [
  { id: 'i1', name: 'Canon EOS R6', availability: 'available' },
  { id: 'i2', name: 'Sony 24–70mm GM', availability: 'available' },
  { id: 'i3', name: 'Aputure 300d', availability: 'available' },
]
const CUSTOMERS = ['Lena Hoffmann', 'Marco Silva']

export function MiniRentalApp() {
  const [items, setItems] = useState(ITEMS)
  const [rentals, setRentals] = useState<Rental[]>([])
  const [item, setItem] = useState('i1')
  const [customer, setCustomer] = useState(CUSTOMERS[0])
  const [log, setLog] = useState<{ id: number; ok: boolean; text: string }[]>([])
  const [seq, setSeq] = useState(1)

  const push = (ok: boolean, text: string) => setLog((l) => [{ id: Date.now() + Math.random(), ok, text }, ...l].slice(0, 3))

  const start = () => {
    const it = items.find((i) => i.id === item)!
    // precondition: An unavailable item cannot be rented.
    if (it.availability !== 'available') return push(false, `Rejected · ${it.name} is ${it.availability}. An unavailable item cannot be rented.`)
    // exclusivity: An item cannot have two active rentals.
    if (rentals.some((r) => r.item === item && r.status === 'active')) return push(false, 'Rejected · item already has an active rental.')
    const id = `RNT-${String(seq).padStart(4, '0')}`
    setSeq(seq + 1)
    setRentals([{ id, item, customer, status: 'active' }, ...rentals])
    // effect: Starting a rental marks the item as rented.
    setItems(items.map((i) => (i.id === item ? { ...i, availability: 'rented' } : i)))
    push(true, `${id} started · ${it.name}: available → rented`)
  }

  const complete = (r: Rental) => {
    if (r.status !== 'active') return push(false, 'Rejected · only active rentals can be returned.')
    setRentals(rentals.map((x) => (x.id === r.id ? { ...x, status: 'returned' } : x)))
    // effect: Completing a return makes the item available again.
    setItems(items.map((i) => (i.id === r.item ? { ...i, availability: 'available' } : i)))
    push(true, `${r.id} returned · ${items.find((i) => i.id === r.item)!.name}: rented → available`)
  }

  const reset = () => {
    setItems(ITEMS)
    setRentals([])
    setLog([])
    setSeq(1)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded bg-accent font-mono text-[10px] font-semibold text-ink-950">E</span>
          <span className="text-[13px] font-medium">Equipment Rental</span>
        </div>
        <button onClick={reset} className="inline-flex items-center gap-1 text-[11.5px] text-fg-subtle hover:text-fg" aria-label="Reset preview">
          <RotateCcw className="size-3" /> Reset
        </button>
      </div>
      <div className="grid gap-px bg-line-soft md:grid-cols-2">
        <div className="bg-ink-900 p-4">
          <p className="meta mb-2">Inventory</p>
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between rounded-lg border border-line-soft bg-ink-950 px-3 py-2">
                <span className="text-[13px] text-fg">{i.name}</span>
                <motion.span
                  key={i.availability}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={cn('rounded-full border px-2 py-0.5 text-[11px]', i.availability === 'available' ? 'border-success/30 text-success' : 'border-accent/40 text-accent')}
                >
                  {i.availability}
                </motion.span>
              </li>
            ))}
          </ul>
          <p className="meta mb-2 mt-5">New rental</p>
          <div className="grid grid-cols-2 gap-2">
            <select className="field-input py-2 text-[13px]" value={item} onChange={(e) => setItem(e.target.value)} aria-label="Item">
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.availability !== 'available' ? ` — ${i.availability}` : ''}
                </option>
              ))}
            </select>
            <select className="field-input py-2 text-[13px]" value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label="Customer">
              {CUSTOMERS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <button onClick={start} className="mt-2 h-9 w-full rounded-full bg-accent text-[13px] font-medium text-ink-950 transition-transform active:scale-[0.98]">
            Start rental
          </button>
        </div>
        <div className="bg-ink-900 p-4">
          <p className="meta mb-2">Active rentals</p>
          <ul className="min-h-[92px] space-y-1.5">
            <AnimatePresence initial={false}>
              {rentals.filter((r) => r.status === 'active').length === 0 && (
                <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] text-fg-subtle">
                  No active rentals. Start one on the left.
                </motion.li>
              )}
              {rentals
                .filter((r) => r.status === 'active')
                .map((r) => (
                  <motion.li key={r.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-ink-950 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-fg">{items.find((i) => i.id === r.item)?.name}</span>
                      <span className="font-mono text-[10.5px] text-fg-subtle">
                        {r.id} · {r.customer}
                      </span>
                    </span>
                    <button onClick={() => complete(r)} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-fg-muted hover:border-accent/50 hover:text-accent">
                      Complete return
                    </button>
                  </motion.li>
                ))}
            </AnimatePresence>
          </ul>
          <p className="meta mb-2 mt-5">Runtime log</p>
          <ul className="space-y-1" aria-live="polite">
            <AnimatePresence initial={false}>
              {log.map((l) => (
                <motion.li key={l.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-2 text-[12px] leading-snug', l.ok ? 'text-fg-muted' : 'text-error')}>
                  {l.ok ? <Check className="mt-0.5 size-3 shrink-0 text-success" /> : <Ban className="mt-0.5 size-3 shrink-0" />}
                  {l.text}
                </motion.li>
              ))}
            </AnimatePresence>
            {log.length === 0 && <li className="text-[12px] text-fg-subtle">Try renting the same item twice.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
