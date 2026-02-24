import { forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-text-secondary">{label}</label>}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">{icon}</span>
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full bg-surface-secondary border text-text-primary placeholder-text-muted rounded-xl px-4 py-2.5 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all duration-200',
            error ? 'border-accent-rose' : 'border-surface-border',
            icon && 'pl-10',
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-accent-rose">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
export default Input
