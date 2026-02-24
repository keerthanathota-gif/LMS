import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

interface CarouselProps {
  children: React.ReactNode[]
  visibleCount?: number
  title?: string
  subtitle?: string
  className?: string
}

export default function Carousel({ children, visibleCount = 3, title, subtitle, className }: CarouselProps) {
  const [page, setPage] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const totalPages = Math.ceil(children.length / visibleCount)

  const prev = useCallback(() => setPage((p) => Math.max(0, p - 1)), [])
  const next = useCallback(() => setPage((p) => Math.min(totalPages - 1, p + 1)), [totalPages])

  // Reset page if children count changes
  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1))
  }, [totalPages, page])

  const startIdx = page * visibleCount
  const visibleItems = children.slice(startIdx, startIdx + visibleCount)

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Header */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between">
          <div>
            {title && <h2 className="text-lg font-semibold font-display text-text-primary">{title}</h2>}
            {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {/* Arrows */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={prev}
                disabled={page === 0}
                className="p-1.5 rounded-lg border border-surface-border hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={next}
                disabled={page === totalPages - 1}
                className="p-1.5 rounded-lg border border-surface-border hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Items */}
      <div ref={containerRef} className="overflow-hidden">
        <motion.div
          className="flex gap-4"
          animate={{ x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {visibleItems.map((child, i) => (
            <motion.div
              key={startIdx + i}
              className="flex-1 min-w-0"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
            >
              {child}
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Dots */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={clsx(
                'w-2 h-2 rounded-full transition-all duration-200',
                i === page ? 'bg-indigo-500 w-5' : 'bg-navy-200 hover:bg-navy-300',
              )}
            />
          ))}
        </div>
      )}

      {/* Count */}
      {children.length > visibleCount && (
        <p className="text-center text-xs text-text-muted">
          Showing {visibleItems.length} of {children.length} items &bull; Page {page + 1} of {totalPages}
        </p>
      )}
    </div>
  )
}
