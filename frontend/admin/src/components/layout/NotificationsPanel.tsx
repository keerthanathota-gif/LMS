import { useEffect, useState } from 'react'
import { Bell, Award, FileCheck, X } from 'lucide-react'
import api from '@services/api'

type NotifItem = {
  id: string
  type: 'badge' | 'cert'
  title: string
  subtitle: string
  time: string
  rawDate: Date
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Props {
  userId: string
  onClose: () => void
}

export default function NotificationsPanel({ userId, onClose }: Props) {
  const [items, setItems] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    Promise.all([
      api.get(`/badges/me?userId=${userId}`).catch(() => ({ data: { data: [] } })),
      api.get(`/certificates/me?user_id=${userId}`).catch(() => ({ data: { data: [] } })),
    ]).then(([badgesRes, certsRes]) => {
      const badges: NotifItem[] = (badgesRes.data.data ?? []).map((b: Record<string, string>) => ({
        id:      `badge-${b.id}`,
        type:    'badge' as const,
        title:   b.name ?? 'Badge earned',
        subtitle: b.description ? b.description.slice(0, 70) : '',
        time:    timeAgo(b.issued_at),
        rawDate: new Date(b.issued_at),
      }))

      const certs: NotifItem[] = (certsRes.data.data ?? []).map((c: Record<string, string>) => ({
        id:      `cert-${c.id}`,
        type:    'cert' as const,
        title:   'Certificate of Completion',
        subtitle: c.course_title ?? '',
        time:    timeAgo(c.issued_at),
        rawDate: new Date(c.issued_at),
      }))

      setItems(
        [...badges, ...certs].sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime()),
      )
    }).finally(() => setLoading(false))
  }, [userId])

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-surface-card border border-surface-border rounded-xl shadow-2xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-xs text-text-muted animate-pulse">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <Bell size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
            <p className="text-xs text-text-muted">No notifications yet</p>
            <p className="text-xs text-text-muted opacity-60 mt-1">
              Complete courses to earn badges &amp; certificates
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex gap-3 px-4 py-3 hover:bg-surface-border/40 border-b border-surface-border/50 last:border-0 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                item.type === 'badge'
                  ? 'bg-yellow-500/10'
                  : 'bg-indigo-500/10'
              }`}>
                {item.type === 'badge'
                  ? <Award size={14} className="text-yellow-400" />
                  : <FileCheck size={14} className="text-indigo-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary leading-snug">{item.title}</p>
                {item.subtitle && (
                  <p className="text-xs text-text-muted truncate mt-0.5">{item.subtitle}</p>
                )}
              </div>
              <span className="text-xs text-text-muted shrink-0 pt-0.5">{item.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
