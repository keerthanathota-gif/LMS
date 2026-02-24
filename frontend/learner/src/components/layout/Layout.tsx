import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  BookOpen,
  Library,
  Trophy,
  Award,
  FileCheck,
  User,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import Avatar from '@components/ui/Avatar'

const NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard'     },
  { to: '/',             icon: BookOpen,        label: 'My Courses'    },
  { to: '/library',      icon: Library,         label: 'Library'       },
  { to: '/leaderboard',  icon: Trophy,          label: 'Leaderboard'   },
  { to: '/badges',       icon: Award,           label: 'Badges'       },
  { to: '/certificates', icon: FileCheck,       label: 'Certificates' },
  { to: '/profile',      icon: User,            label: 'Profile'      },
]

function NavPill({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`
        relative px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap
        ${active
          ? 'text-white'
          : 'text-navy-500 hover:text-text-primary hover:bg-navy-50'
        }
      `}
    >
      {active && (
        <motion.div
          layoutId="learner-nav-pill"
          className="absolute inset-0 bg-indigo-500 rounded-full"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </Link>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => { clearAuth(); navigate('/login') }

  const isActive = (to: string) =>
    to === '/'
      ? location.pathname === '/'
      : location.pathname === to || location.pathname.startsWith(to + '/')

  return (
    <div className="flex flex-col min-h-screen bg-surface-primary">
      {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-surface-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left: Logo */}
            <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
              <span className="font-semibold text-sm text-text-primary hidden sm:block">Learnings</span>
            </Link>

            {/* Center: Nav pills (desktop) */}
            <nav className="hidden md:flex items-center gap-1 bg-surface-secondary rounded-full p-1">
              {NAV.map(({ to, label }) => (
                <NavPill key={to} to={to} label={label} active={isActive(to)} />
              ))}
            </nav>

            {/* Right: User + mobile hamburger */}
            <div className="flex items-center gap-3">
              {/* User avatar + name (desktop) */}
              <div className="hidden sm:flex items-center gap-2">
                <Avatar name={user?.fullName} size="sm" />
                <span className="text-sm text-text-secondary font-medium max-w-[120px] truncate">
                  {user?.fullName}
                </span>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent-rose hover:bg-accent-rose/5 transition-colors"
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </div>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Mobile dropdown menu ─────────────────────────────────────── */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="md:hidden overflow-hidden border-t border-surface-border bg-white"
            >
              <nav className="px-4 py-3 space-y-1">
                {NAV.map(({ to, icon: Icon, label }) => {
                  const active = isActive(to)
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                        active
                          ? 'bg-indigo-500/10 text-indigo-600 font-medium'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </Link>
                  )
                })}

                {/* Mobile user section */}
                <div className="pt-2 mt-2 border-t border-surface-border">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={user?.fullName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{user?.fullName}</p>
                      <p className="text-xs text-text-muted capitalize">{user?.role}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="p-2 rounded-lg text-text-muted hover:text-accent-rose transition-colors"
                      title="Sign out"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
