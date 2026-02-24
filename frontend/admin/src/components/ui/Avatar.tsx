import { clsx } from 'clsx'

interface AvatarProps {
  name?: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  status?: 'online' | 'offline' | 'away'
}

const sizes = {
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
}

const statusColors = {
  online:  'bg-accent-emerald',
  offline: 'bg-navy-300',
  away:    'bg-accent-amber',
}

export default function Avatar({ name, src, size = 'md', className, status }: AvatarProps) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className={clsx('relative inline-flex shrink-0', className)}>
      {src ? (
        <img src={src} alt={name ?? ''} className={clsx('rounded-full object-cover', sizes[size])} />
      ) : (
        <div className={clsx(
          'rounded-full flex items-center justify-center font-bold bg-indigo-500/15 text-indigo-600',
          sizes[size],
        )}>
          {initials}
        </div>
      )}
      {status && (
        <span className={clsx(
          'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white',
          statusColors[status],
        )} />
      )}
    </div>
  )
}
