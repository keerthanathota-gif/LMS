import { useEffect, useState } from 'react'
import { Trophy, Zap, Loader2 } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

interface Entry { user_id: string; full_name: string; total_xp: number; rank: number }

export default function LeaderboardPage() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/quiz/leaderboard?orgId=${user?.orgId}&limit=20`)
      .then((res) => setEntries(res.data.data ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [user?.orgId])

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Leaderboard</h1>
        <p className="text-sm text-text-muted mt-0.5">Top learners by XP</p>
      </div>
      {entries.length === 0 ? (
        <div className="card p-12 text-center">
          <Trophy size={36} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No data yet</p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-surface-border">
          {entries.map((e, i) => {
            const isMe = e.user_id === user?.id
            const medal = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-text-muted'
            return (
              <div key={e.user_id} className={`flex items-center gap-4 px-5 py-4 ${isMe ? 'bg-brand-500/5' : ''}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-surface-secondary' : ''} ${medal}`}>
                  {i < 3 ? <Trophy size={16} /> : i + 1}
                </span>
                <p className={`flex-1 text-sm font-medium ${isMe ? 'text-brand-400' : 'text-text-primary'}`}>
                  {e.full_name} {isMe && <span className="text-xs text-text-muted">(you)</span>}
                </p>
                <div className="flex items-center gap-1.5">
                  <Zap size={14} className="text-yellow-400" />
                  <span className="text-sm font-bold text-text-primary">{e.total_xp}</span>
                  <span className="text-xs text-text-muted">XP</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
