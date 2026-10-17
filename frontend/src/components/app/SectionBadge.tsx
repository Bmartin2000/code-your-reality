import type { ManifestEntity } from '../../lib/types'
import { sectionColor } from '../../lib/sections'
import { cn } from '../../lib/cn'

/** The coloured monogram tile that marks a section (category) of an app everywhere it appears. */
export function SectionTile({ entity, size = 'md', className }: { entity: Pick<ManifestEntity, 'plural_label' | 'color'>; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const c = sectionColor(entity.color)
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-[Poppins] font-semibold',
        c.tile,
        size === 'sm' ? 'size-6 rounded-lg text-[11px]' : size === 'lg' ? 'size-12 text-[19px]' : 'size-8 text-[13px]',
        className,
      )}
    >
      {entity.plural_label.trim().slice(0, 1).toUpperCase()}
    </span>
  )
}
