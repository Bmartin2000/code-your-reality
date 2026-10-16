import { create } from 'zustand'
import type { Evidence, Reviewable, ReviewStatus, WorkflowDefinition } from './workflow-schema'

export type SelectionKind = 'workflow' | 'entity' | 'field' | 'machine' | 'transition' | 'rule' | 'action' | 'stage' | 'question'
export interface Selection {
  kind: SelectionKind
  id: string
}

interface WorkspaceState {
  projectId: string | null
  draft: WorkflowDefinition | null
  baseVersion: number
  revision: number
  savedRevision: number
  selection: Selection | null
  load: (projectId: string, d: WorkflowDefinition, version: number) => void
  acceptServer: (d: WorkflowDefinition, version: number, revisionAtSave: number) => void
  update: (fn: (d: WorkflowDefinition) => void) => void
  select: (s: Selection | null) => void
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  projectId: null,
  draft: null,
  baseVersion: 0,
  revision: 0,
  savedRevision: 0,
  selection: null,
  load: (projectId, d, version) => {
    const same = get().projectId === projectId
    set({ projectId, draft: structuredClone(d), baseVersion: version, revision: 0, savedRevision: 0, selection: same ? get().selection : null })
  },
  acceptServer: (d, version, revisionAtSave) => {
    const { revision } = get()
    // Only replace local state if nothing changed while the request was in flight.
    if (revision === revisionAtSave) set({ draft: structuredClone(d), baseVersion: version, savedRevision: revision })
    else set({ baseVersion: version, savedRevision: revisionAtSave })
  },
  update: (fn) => {
    const d = get().draft
    if (!d) return
    const next = structuredClone(d)
    fn(next)
    set({ draft: next, revision: get().revision + 1 })
  },
  select: (selection) => set({ selection }),
}))

export function setReview(item: Reviewable, status: ReviewStatus) {
  item.review = { ...item.review, status, at: new Date().toISOString() }
}

export function markEdited(item: Reviewable) {
  item.review = { ...item.review, edited: true, at: new Date().toISOString() }
}

export const humanProvenance = (note = 'Added by a reviewer.') => ({ source: 'human' as const, evidence: [], confidence: null, note })
export const acceptedReview = () => ({ status: 'accepted' as const, edited: false, note: '', at: new Date().toISOString() })

// --- Evidence playhead shared by the player, transcript and inspector ------------------------

interface PlayerState {
  time: number
  duration: number
  seekNonce: number
  seekTarget: number
  highlight: Evidence[]
  setTime: (t: number) => void
  setDuration: (d: number) => void
  seek: (t: number) => void
  setHighlight: (e: Evidence[]) => void
}

export const usePlayer = create<PlayerState>((set, get) => ({
  time: 0,
  duration: 0,
  seekNonce: 0,
  seekTarget: 0,
  highlight: [],
  setTime: (time) => set({ time }),
  setDuration: (duration) => set({ duration }),
  seek: (t) => set({ seekTarget: Math.max(0, t), seekNonce: get().seekNonce + 1, time: Math.max(0, t) }),
  setHighlight: (highlight) => set({ highlight }),
}))
