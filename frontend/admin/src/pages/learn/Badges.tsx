import { useEffect, useState } from 'react'
import { Award, Loader2, Linkedin } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

interface Badge { id: string; name: string; description: string; image_url?: string; issued_at: string; skill_tags: string[] }

export default function BadgesPage() {
  const { user } = useAuthStore()
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    api.get(`/badges/me?userId=${user.id}`)
      .then((res) => setBadges(res.data.data ?? []))
      .catch(() => setBadges([]))
      .finally(() => setLoading(false))
  }, [user?.id])

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">My Badges</h1>
        <p className="text-sm text-text-muted mt-0.5">{badges.length} badge{badges.length !== 1 ? 's' : ''} earned</p>
      </div>
      {badges.length === 0 ? (
        <div className="card p-12 text-center">
          <Award size={36} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No badges yet</p>
          <p className="text-xs text-text-muted mt-1">Complete modules and quizzes to earn badges</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {badges.map((b) => (
            <div key={b.id} className="card p-4 text-center">
              {b.image_url ? (
                <img src={b.image_url} alt={b.name} className="w-16 h-16 mx-auto mb-3 rounded-full" />
              ) : (
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <Award size={24} className="text-yellow-400" />
                </div>
              )}
              <p className="text-sm font-semibold text-text-primary">{b.name}</p>
              {b.description && <p className="text-xs text-text-muted mt-1 line-clamp-2">{b.description}</p>}
              <p className="text-xs text-text-muted mt-2">{new Date(b.issued_at).toLocaleDateString()}</p>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.origin)}&title=${encodeURIComponent(`I earned the "${b.name}" badge! 🏅`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 text-xs text-[#0077B5] bg-[#0077B5]/10 rounded-lg hover:bg-[#0077B5]/20 transition-colors"
              >
                <Linkedin size={11} /> Share
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
