import { describe, expect, it } from 'vitest'
import { reviewCounts, toKey, uniqueKey, workflowSchema, type WorkflowDefinition } from './workflow-schema'
import { acceptWhere, removeEntity, renameFieldKey } from './workflow-ops'

const prov = (source: 'observed' | 'narration' | 'inferred' | 'human') => ({ source, evidence: [], confidence: null, note: '' })
const review = (status: 'pending' | 'accepted' | 'rejected' = 'pending') => ({ status, edited: false, note: '' })
const field = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
  key,
  label: key,
  type,
  required: false,
  description: '',
  options: [],
  system: false,
  provenance: prov('narration'),
  review: review(),
  ...extra,
})

function sample(): WorkflowDefinition {
  return workflowSchema.parse({
    schema_version: '1.0',
    id: 'rental',
    name: 'Rental',
    version: 1,
    entities: [
      { key: 'item', label: 'Item', plural_label: 'Items', title_field: 'name', fields: [field('name', 'text'), field('availability', 'enum', { options: ['available', 'rented'] })], provenance: prov('observed'), review: review() },
      { key: 'rental', label: 'Rental', plural_label: 'Rentals', title_field: 'item', fields: [field('item', 'reference', { ref_entity: 'item' })], provenance: prov('inferred'), review: review() },
    ],
    state_machines: [],
    rules: [
      { id: 'avail', kind: 'ref_field_equals', statement: 'Item must be available', params: { entity: 'rental', on: 'create', ref_field: 'item', target_field: 'availability', equals: 'available' }, provenance: prov('narration'), review: review() },
    ],
    actions: [],
    stages: [],
    views: [],
    questions: [],
  })
}

describe('workflow schema helpers', () => {
  it('normalizes free text into safe keys', () => {
    expect(toKey('Return Date')).toBe('return_date')
    expect(toKey('  2nd step ')).toBe('item_2nd_step')
    expect(uniqueKey('field', ['field', 'field_2'])).toBe('field_3')
  })

  it('rejects malformed definitions', () => {
    const bad = { ...sample(), id: 'Not A Key' }
    expect(workflowSchema.safeParse(bad).success).toBe(false)
  })

  it('counts review states across every reviewable item', () => {
    expect(reviewCounts(sample())).toEqual({ pending: 6, accepted: 0, rejected: 0 })
  })

  it('confirms only items backed by direct evidence', () => {
    const d = sample()
    acceptWhere(d, (s) => s === 'observed' || s === 'narration')
    expect(d.entities[1].review.status).toBe('pending') // inferred entity stays pending
    expect(d.entities[0].review.status).toBe('accepted')
    expect(d.rules[0].review.status).toBe('accepted')
  })
})

describe('workflow operations', () => {
  it('renaming a field rewrites rule parameters that point at it', () => {
    const d = sample()
    renameFieldKey(d, 'item', 'availability', 'status')
    expect(d.rules[0].params.target_field).toBe('status')
    renameFieldKey(d, 'rental', 'item', 'equipment')
    expect(d.rules[0].params.ref_field).toBe('equipment')
    expect(d.entities[1].title_field).toBe('equipment')
  })

  it('removing an entity removes its rules and downgrades references to it', () => {
    const d = sample()
    removeEntity(d, 'item')
    expect(d.entities.map((e) => e.key)).toEqual(['rental'])
    expect(d.entities[0].fields[0].type).toBe('text')
    removeEntity(d, 'rental')
    expect(d.rules).toHaveLength(0)
  })
})
