import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, LogOut, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import { useAuth } from '@hooks/useAuth'
import NotificationsPanel from './NotificationsPanel'
import Avatar from '@components/ui/Avatar'
import api from '@services/api'

/* ── Breadcrumb map ───────────────────────────────────────────────────── */

const PAGE_TITLES: Record<string, string> = {
  '/chat':       'Chat Studio',
  '/dashboard':  'Dashboard',
  '/courses':    'Courses',
  '/users':      'Users',
  '/analytics':  'Analytics',
  '/settings':   'Settings',
  '/learn':      'My Courses',
  '/learn/profile': 'Profile',
}

function getBreadcrumbs(pathname: string): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [{ label: 'Home', path: '/' }]

  // Match known routes
  for (const [path, label] of Object.entries(PAGE_TITLES)) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      crumbs.push({ label, path })
      break
    }
  }

  // Handle dynamic segments like /learn/courses/:id
  if (pathname.startsWith('/learn/courses/')) {
    crumbs.push({ label: 'My Courses', path: '/learn' })
    crumbs.push({ label: 'Course', path: pathname })
  }

  return crumbs
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function Header() {
  const { user } = useAuthStore()
  const { logout } = useAuth()
  const location = useLocation()
  const [showNotifs, setShowNotifs]     = useState(false)
  const [unreadCount, setUnreadCount]   = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const breadcrumbs = getBreadcrumbs(location.pathname)
  const pageTitle = PAGE_TITLES[location.pathname] ?? breadcrumbs[breadcrumbs.length - 1]?.label ?? ''

  // Load unread count on mount
  useEffect(() => {
    if (!user?.id) return
    const lastSeen = localStorage.getItem(`lms_notifs_seen_${user.id}`) ?? '1970-01-01T00:00:00Z'

    Promise.all([
      api.get(`/badges/me?userId=${user.id}`).catch(() => ({ data: { data: [] } })),
      api.get(`/certificates/me?user_id=${user.id}`).catch(() => ({ data: { data: [] } })),
    ]).then(([b, c]) => {
      const all = [
        ...(b.data.data ?? []).map((x: { issued_at: string }) => x.issued_at),
        ...(c.data.data ?? []).map((x: { issued_at: string }) => x.issued_at),
      ]
      const unread = all.filter((d) => new Date(d) > new Date(lastSeen)).length
      setUnreadCount(unread)
    }).catch(() => {})
  }, [user?.id])

  // Close panel on outside click
  useEffect(() => {
    if (!showNotifs) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotifs])

  const handleBellClick = () => {
    const opening = !showNotifs
    setShowNotifs(opening)
    if (opening && user?.id) {
      localStorage.setItem(`lms_notifs_seen_${user.id}`, new Date().toISOString())
      setUnreadCount(0)
    }
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-surface-border shrink-0 sticky top-0 z-30 shadow-sm">
      {/* Left: breadcrumb + page title */}
      <div>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={10} className="text-navy-200" />}
              <span className={i === breadcrumbs.length - 1 ? 'text-text-secondary font-medium' : ''}>
                {crumb.label}
              </span>
            </span>
          ))}
        </div>
        <h1 className="text-lg font-semibold font-display text-text-primary mt-0.5">{pageTitle}</h1>
      </div>

      {/* Right: notifications + avatar + logout */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <div ref={panelRef} className="relative">
          <button
            className="relative p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            onClick={handleBellClick}
            title="Notifications"
          >
            <Bell size={18} />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-indigo-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {showNotifs && (
            <NotificationsPanel
              userId={user?.id ?? ''}
              onClose={() => setShowNotifs(false)}
            />
          )}
        </div>

        {/* Divider + avatar + logout */}
        <div className="flex items-center gap-3 pl-3 border-l border-surface-border">
          <Avatar name={user?.fullName} size="sm" />
          <button
            onClick={logout}
            className="p-2 rounded-xl text-text-muted hover:text-accent-rose hover:bg-accent-rose/5 transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
