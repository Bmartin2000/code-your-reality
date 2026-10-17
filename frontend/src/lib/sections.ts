import type { SectionColor } from './types'

/** Colours an owner can give the sections (categories) of an app. Literal classes for Tailwind. */
export const SECTION_COLORS: Record<SectionColor, { name: string; tile: string; solid: string; text: string; soft: string; border: string; hex: string }> = {
  blue: { name: 'Blue', tile: 'bg-[#E6F4FF] text-[#0077BE]', solid: 'bg-[#0077BE] text-white', text: 'text-[#0077BE]', soft: 'bg-[#F2F9FF]', border: 'border-[#0077BE]/25', hex: '#0077BE' },
  teal: { name: 'Teal', tile: 'bg-[#E3F7F4] text-[#0B8577]', solid: 'bg-[#0B8577] text-white', text: 'text-[#0B8577]', soft: 'bg-[#F1FBF9]', border: 'border-[#0B8577]/25', hex: '#0B8577' },
  violet: { name: 'Violet', tile: 'bg-[#EFEBFC] text-[#6247C9]', solid: 'bg-[#6247C9] text-white', text: 'text-[#6247C9]', soft: 'bg-[#F7F5FE]', border: 'border-[#6247C9]/25', hex: '#6247C9' },
  amber: { name: 'Amber', tile: 'bg-[#FDF1DC] text-[#9A6412]', solid: 'bg-[#B7791F] text-white', text: 'text-[#9A6412]', soft: 'bg-[#FFF9EF]', border: 'border-[#B7791F]/25', hex: '#B7791F' },
  rose: { name: 'Rose', tile: 'bg-[#FCE9EC] text-[#BE2F49]', solid: 'bg-[#BE2F49] text-white', text: 'text-[#BE2F49]', soft: 'bg-[#FEF5F6]', border: 'border-[#BE2F49]/25', hex: '#BE2F49' },
  green: { name: 'Green', tile: 'bg-[#E7F6EA] text-[#2B8A3E]', solid: 'bg-[#2B8A3E] text-white', text: 'text-[#2B8A3E]', soft: 'bg-[#F3FBF4]', border: 'border-[#2B8A3E]/25', hex: '#2B8A3E' },
  slate: { name: 'Slate', tile: 'bg-[#EEF1F4] text-[#46525E]', solid: 'bg-[#46525E] text-white', text: 'text-[#46525E]', soft: 'bg-[#F7F8FA]', border: 'border-[#46525E]/25', hex: '#46525E' },
}

export const COLOR_KEYS = Object.keys(SECTION_COLORS) as SectionColor[]

export function sectionColor(color: SectionColor | undefined) {
  return SECTION_COLORS[color ?? 'blue'] ?? SECTION_COLORS.blue
}
