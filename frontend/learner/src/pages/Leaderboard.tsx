import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Zap, Loader2, Medal } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import Avatar from '@components/ui/Avatar'

interface LeaderboardEntry {
  user_id: string; full_name: string; total_xp: number; rank: number
}

const MEDAL_COLORS = [
  'from-yellow-400/30 to-yellow-500/10 border-yellow-400/40',
  'from-slate-300/30 to-slate-400/10 border-slate-300/40',
  'from-amber-600/30 to-amber-700/10 border-amber-600/40',
]
const MEDAL_TEXT   = ['text-yellow-500', 'text-slate-400', 'text-amber-600']
const MEDAL_ICONS  = ['text-yellow-500 fill-yellow-500', 'text-slate-400 fill-slate-400', 'text-amber-600 fill-amber-600']

export default function LeaderboardPage() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/quiz/leaderboard?orgId=${user?.orgId}&limit=20`)
      .then((res) => setEntries(res.data.data ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [user?.orgId])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={24} className="animate-spin text-indigo-400" />
    </div>
  )

  const top3    = entries.slice(0, 3)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Leaderboard</h1>
        <p className="text-sm text-text-muted mt-0.5">Top learners by XP earned</p>
      </div>

      {entries.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-accent-amber/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Trophy size={28} className="text-accent-amber" />
          </div>
          <p className="text-sm font-semibold text-text-secondary">No leaderboard data yet</p>
          <p className="text-xs text-text-muted mt-1">Complete quizzes to earn XP and climb the ranks</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length >= 3 && (
            <div className="flex items-end justify-center gap-3 mb-6">
              {/* Reorder: 2nd, 1st, 3rd */}
              {[top3[1], top3[0], top3[2]].map((entry, idx) => {
                const podiumIdx = idx === 0 ? 1 : idx === 1 ? 0 : 2
                const heights  = ['h-24', 'h-32', 'h-20']
                const isMe     = entry.user_id === user?.id
                return (
                  <motion.div
                    key={entry.user_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: podiumIdx * 0.1 }}
                    className="flex flex-col items-center gap-2 flex-1"
                  >
                    <Avatar name={entry.full_name} size={podiumIdx === 0 ? 'lg' : 'md'} />
                    <p className={`text-xs font-semibold text-center truncate max-w-[80px] ${isMe ? 'text-indigo-500' : 'text-text-primary'}`}>
                      {entry.full_name.split(' ')[0]}
                    </p>
                    <div className="flex items-center gap-1">
                      <Zap size={10} className="text-accent-amber" />
                      <span className="text-xs font-bold text-text-primary">{entry.total_xp}</span>
                    </div>
                    <div className={`w-full ${heights[idx]} rounded-t-xl bg-gradient-to-t border ${MEDAL_COLORS[podiumIdx]} flex items-start justify-center pt-2`}>
                      <Trophy size={podiumIdx === 0 ? 20 : 16} className={MEDAL_ICONS[podiumIdx]} />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Full list */}
          <div className="card overflow-hidden">
            <div className="divide-y divide-surface-border">
              {entries.map((e, i) => {
                const isMe = e.user_id === user?.id
                return (
                  <motion.div
                    key={e.user_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${isMe ? 'bg-indigo-500/5' : 'hover:bg-surface-secondary/40'}`}
                  >
                    {/* Rank */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      i < 3 ? `bg-gradient-to-br ${MEDAL_COLORS[i].split(' ')[0]} ${MEDAL_COLORS[i].split(' ')[1]}` : 'bg-surface-secondary'
                    }`}>
                      {i < 3
                        ? <Medal size={14} className={MEDAL_TEXT[i]} />
                        : <span className="text-text-muted text-xs">{i + 1}</span>
                      }
                    </div>

                    {/* Avatar + name */}
                    <Avatar name={e.full_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isMe ? 'text-indigo-500' : 'text-text-primary'}`}>
                        {e.full_name}
                        {isMe && <span className="ml-1.5 text-xs text-text-muted font-normal">(you)</span>}
                      </p>
                    </div>

                    {/* XP */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Zap size={13} className="text-accent-amber" />
                      <span className="text-sm font-bold text-text-primary">{e.total_xp}</span>
                      <span className="text-xs text-text-muted">XP</span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
