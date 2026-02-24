import { motion } from 'framer-motion'
import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  padding?: boolean
  onClick?: () => void
}

export default function Card({ children, className, hover = false, padding = true, onClick }: CardProps) {
  const Component = hover ? motion.div : 'div'
  const hoverProps = hover
    ? { whileHover: { y: -2, boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08)' }, transition: { duration: 0.2 } }
    : {}

  return (
    <Component
      className={clsx(
        'bg-surface-card border border-surface-border rounded-2xl shadow-sm',
        hover && 'cursor-pointer hover:border-indigo-200 transition-colors',
        padding && 'p-5',
        className,
      )}
      onClick={onClick}
      {...hoverProps}
    >
      {children}
    </Component>
  )
}
