import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Award, FileCheck, ExternalLink, Download, Zap } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import type { Badge, Certificate } from '@lms-types/index'
import Avatar from '@components/ui/Avatar'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [badges, setBadges]             = useState<Badge[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [totalXp, setTotalXp]           = useState<number>(0)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    if (!user?.id) return
    Promise.all([
      api.get(`/badges/me?userId=${user.id}`).catch(() => ({ data: { data: [] } })),
      api.get(`/certificates/me?user_id=${user.id}`).catch(() => ({ data: { data: [] } })),
      api.get(`/quiz/xp/${user.id}`).catch(() => ({ data: { data: { totalXp: 0 } } })),
    ])
      .then(([badgesRes, certsRes, xpRes]) => {
        setBadges(badgesRes.data.data ?? [])
        setCertificates(certsRes.data.data ?? [])
        setTotalXp(xpRes.data.data?.totalXp ?? 0)
      })
      .finally(() => setLoading(false))
  }, [user?.id])

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex items-center gap-5">
          <Avatar name={user?.fullName} size="lg" />
          <div className="flex-1">
            <p className="text-xl font-bold font-display text-text-primary">{user?.fullName}</p>
            <p className="text-sm text-text-secondary mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-3 mt-3">
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 capitalize">
                {user?.role}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-accent-amber font-bold">
                <Zap size={14} className="fill-accent-amber" />
                {totalXp} XP
              </span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-surface-border">
          {[
            { label: 'Badges', value: badges.length, color: 'text-accent-amber' },
            { label: 'Certificates', value: certificates.length, color: 'text-accent-emerald' },
            { label: 'XP Earned', value: totalXp, color: 'text-indigo-500' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className={`text-2xl font-bold font-display ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-text-muted mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Badges */}
      <section>
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <Award size={13} className="text-accent-amber" />
          Badges ({badges.length})
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1,2].map((i) => <div key={i} className="h-24 bg-surface-card rounded-2xl animate-pulse" />)}
          </div>
        ) : badges.length === 0 ? (
          <div className="card p-8 text-center">
            <Award size={28} className="text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-secondary">No badges yet</p>
            <p className="text-xs text-text-muted mt-1">Complete courses to earn badges</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {badges.map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                className="card p-4 flex flex-col items-center text-center gap-2"
              >
                <img
                  src={b.image_url}
                  alt={b.name}
                  className="w-12 h-12 rounded-full object-cover bg-surface-border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <p className="text-xs font-semibold text-text-primary">{b.name}</p>
                {b.description && <p className="text-xs text-text-muted line-clamp-2">{b.description}</p>}
                {(b.assertion_url ?? b.assertionUrl) && (
                  <a
                    href={b.assertion_url ?? b.assertionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-600"
                  >
                    <ExternalLink size={11} />
                    View
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Certificates */}
      <section>
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <FileCheck size={13} className="text-accent-emerald" />
          Certificates ({certificates.length})
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1,2].map((i) => <div key={i} className="h-20 bg-surface-card rounded-2xl animate-pulse" />)}
          </div>
        ) : certificates.length === 0 ? (
          <div className="card p-8 text-center">
            <FileCheck size={28} className="text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-secondary">No certificates yet</p>
            <p className="text-xs text-text-muted mt-1">Complete all modules and quizzes to earn a certificate</p>
          </div>
        ) : (
          <div className="space-y-3">
            {certificates.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card p-4 flex items-center gap-4"
              >
                <div className="w-10 h-10 bg-accent-emerald/10 rounded-xl flex items-center justify-center shrink-0">
                  <FileCheck size={18} className="text-accent-emerald" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {c.course_title ?? c.courseTitle}
                  </p>
                  <p className="text-xs text-text-muted">
                    {c.org_name ?? c.orgName} · Issued {new Date(c.issued_at ?? c.issuedAt ?? '').toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(c.verify_url ?? c.verifyUrl) && (
                    <a href={c.verify_url ?? c.verifyUrl} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
                      <ExternalLink size={12} />
                      Verify
                    </a>
                  )}
                  {(c.pdf_url ?? c.pdfUrl) && (
                    <a href={c.pdf_url ?? c.pdfUrl} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
                      <Download size={12} />
                      PDF
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
