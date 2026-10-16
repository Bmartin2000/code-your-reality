import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '../../lib/cn'

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn('mx-auto w-full px-4 py-8 sm:px-6 md:px-8 md:py-10 xl:px-12', wide ? 'max-w-[1760px]' : 'max-w-[1280px]', className)}
    >
      {children}
    </motion.div>
  )
}
