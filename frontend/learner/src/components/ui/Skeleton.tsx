import { clsx } from 'clsx'

interface SkeletonProps {
  className?: string
  variant?: 'line' | 'circle' | 'card' | 'avatar'
}

function Skeleton({ className, variant = 'line' }: SkeletonProps) {
  const base = 'animate-pulse bg-navy-100 rounded'
  const variantClass = {
    line:   'h-3.5 rounded',
    circle: 'rounded-full',
    card:   'rounded-2xl',
    avatar: 'w-9 h-9 rounded-full',
  }[variant]

  return <div className={clsx(base, variantClass, className)} />
}

function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Skeleton variant="avatar" />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-48 h-3.5" />
        <Skeleton className="w-24 h-3" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-surface-border overflow-hidden">
      <Skeleton className="w-full h-36" variant="card" />
      <div className="p-4 space-y-2">
        <Skeleton className="w-3/4 h-4" />
        <Skeleton className="w-1/2 h-3" />
      </div>
    </div>
  )
}

export { Skeleton, SkeletonTableRow, SkeletonCard }
export default Skeleton
