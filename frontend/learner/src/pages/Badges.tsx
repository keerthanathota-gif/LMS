import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Award, Loader2, Linkedin } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

interface Badge {
  id: string; name: string; description: string; image_url?: string
  issued_at: string; skill_tags: string[]
}

export default function BadgesPage() {
  const { user } = useAuthStore()
  const [badges, setBadges]   = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    api.get(`/badges/me?userId=${user.id}`)
      .then((res) => setBadges(res.data.data ?? []))
      .catch(() => setBadges([]))
      .finally(() => setLoading(false))
  }, [user?.id])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={24} className="animate-spin text-indigo-400" />
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">My Badges</h1>
        <p className="text-sm text-text-muted mt-0.5">
          {badges.length} badge{badges.length !== 1 ? 's' : ''} earned
        </p>
      </div>

      {badges.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-accent-amber/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Award size={28} className="text-accent-amber" />
          </div>
          <p className="text-sm font-semibold text-text-secondary">No badges yet</p>
          <p className="text-xs text-text-muted mt-1">Complete modules and quizzes to earn badges</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {badges.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              whileHover={{ y: -4, boxShadow: '0 12px 24px -4px rgba(0,0,0,0.1)' }}
              className="card p-5 text-center cursor-default"
            >
              {b.image_url ? (
                <img src={b.image_url} alt={b.name} className="w-16 h-16 mx-auto mb-3 rounded-full object-cover shadow-sm" />
              ) : (
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-accent-amber/20 to-accent-amber/5 flex items-center justify-center shadow-sm">
                  <Award size={26} className="text-accent-amber" />
                </div>
              )}
              <p className="text-sm font-semibold text-text-primary">{b.name}</p>
              {b.description && (
                <p className="text-xs text-text-muted mt-1.5 line-clamp-2 leading-relaxed">{b.description}</p>
              )}
              <div className="mt-3 pt-3 border-t border-surface-border">
                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide">
                  Earned {new Date(b.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.origin)}&title=${encodeURIComponent(`I earned the "${b.name}" badge! 🏅`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 text-xs text-[#0077B5] bg-[#0077B5]/10 rounded-lg hover:bg-[#0077B5]/20 transition-colors"
              >
                <Linkedin size={11} /> Share on LinkedIn
              </a>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
