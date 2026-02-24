import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  LayoutDashboard,
  BookOpen,
  Users,
  BarChart3,
  User,
  Settings,
  GraduationCap,
  Library,
  Trophy,
  Award,
  FileCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import Avatar from '@components/ui/Avatar'

const adminNav = [
  { to: '/chat',      icon: MessageSquare,   label: 'Chat Studio' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/courses',   icon: BookOpen,        label: 'Courses'     },
  { to: '/users',     icon: Users,           label: 'Users'       },
  { to: '/analytics', icon: BarChart3,       label: 'Analytics'   },
  { to: '/settings',  icon: Settings,        label: 'Settings'    },
]

const learnerNav = [
  { to: '/learn',                icon: GraduationCap, label: 'My Courses'    },
  { to: '/learn/library',       icon: Library,        label: 'Library'       },
  { to: '/learn/leaderboard',   icon: Trophy,         label: 'Leaderboard'  },
  { to: '/learn/badges',        icon: Award,          label: 'Badges'       },
  { to: '/learn/certificates',  icon: FileCheck,      label: 'Certificates' },
  { to: '/learn/profile',       icon: User,           label: 'Profile'      },
]

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
}: {
  to: string
  icon: React.ElementType
  label: string
  collapsed: boolean
}) {
  const location = useLocation()
  const active = to === '/learn'
    ? location.pathname === '/learn'
    : location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={`
        flex items-center gap-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer relative
        ${collapsed ? 'justify-center px-2.5' : 'px-3'}
        ${active
          ? 'bg-white/15 text-white font-medium'
          : 'text-white/70 hover:text-white hover:bg-white/10'
        }
      `}
    >
      {active && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white rounded-r-full"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      <Icon size={18} className="shrink-0" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15 }}
            className="text-sm whitespace-nowrap overflow-hidden"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  )
}

export default function Sidebar() {
  const { user } = useAuthStore()
  const isLearner = user?.role === 'learner'
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex flex-col shrink-0 bg-[#2B4B8C] overflow-hidden"
    >
      {/* Logo + collapse toggle */}
      <div className={`flex items-center border-b border-white/10 ${collapsed ? 'justify-center py-5 px-2' : 'justify-between px-5 py-5'}`}>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <p className="text-sm font-semibold text-white whitespace-nowrap">Learnings</p>
                <p className="text-[10px] text-white/50 capitalize whitespace-nowrap">{user?.role?.replace('_', ' ')}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-white/50 hover:text-white transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-3 text-white/50 hover:text-white transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {!isLearner && (
          <>
            {!collapsed && (
              <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Management
              </p>
            )}
            {adminNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}

            <div className="my-3 border-t border-white/10" />
            {!collapsed && (
              <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Learner View
              </p>
            )}
          </>
        )}
        {learnerNav.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-white/10">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-xl ${collapsed ? 'justify-center' : ''}`}>
          <Avatar name={user?.fullName} size="sm" />
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-w-0 overflow-hidden"
              >
                <p className="text-xs font-medium text-white truncate">{user?.fullName}</p>
                <p className="text-[10px] text-white/50 truncate capitalize">{user?.role}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}
