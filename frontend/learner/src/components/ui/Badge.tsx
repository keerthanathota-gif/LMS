import { clsx } from 'clsx'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default' | 'purple'

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-accent-emerald/10 text-accent-emerald',
  warning: 'bg-accent-amber/10 text-accent-amber',
  error:   'bg-accent-rose/10 text-accent-rose',
  info:    'bg-indigo-500/10 text-indigo-600',
  default: 'bg-navy-100 text-navy-500',
  purple:  'bg-accent-violet/10 text-accent-violet',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  dot?: boolean
}

export default function Badge({ variant = 'default', children, className, dot }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full',
      variantStyles[variant],
      className,
    )}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
