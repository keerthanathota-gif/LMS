import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FileCheck, Download, ExternalLink, Loader2, Award } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

interface Certificate {
  id: string; course_title: string; org_name: string
  pdf_url: string; verify_url: string; issued_at: string; expires_at?: string
}

export default function CertificatesPage() {
  const { user } = useAuthStore()
  const [certs, setCerts]     = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    api.get(`/certificates/me?user_id=${user.id}`)
      .then((res) => setCerts(res.data.data ?? []))
      .catch(() => setCerts([]))
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
        <h1 className="text-2xl font-bold font-display text-text-primary">My Certificates</h1>
        <p className="text-sm text-text-muted mt-0.5">
          {certs.length} certificate{certs.length !== 1 ? 's' : ''} earned
        </p>
      </div>

      {certs.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-accent-emerald/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Award size={28} className="text-accent-emerald" />
          </div>
          <p className="text-sm font-semibold text-text-secondary">No certificates yet</p>
          <p className="text-xs text-text-muted mt-1">Complete all modules in a course to earn a certificate</p>
        </div>
      ) : (
        <div className="space-y-3">
          {certs.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              {/* Icon */}
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 rounded-xl flex items-center justify-center shrink-0">
                <FileCheck size={20} className="text-indigo-500" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">{c.course_title}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {c.org_name}
                  <span className="mx-1.5">·</span>
                  Issued {new Date(c.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {c.expires_at && (
                  <p className="text-[10px] text-accent-amber mt-0.5">
                    Expires {new Date(c.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={c.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-500/10 rounded-lg hover:bg-indigo-500/20 transition-colors"
                >
                  <Download size={12} /> PDF
                </a>
                <a
                  href={c.verify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted bg-surface-secondary rounded-lg hover:bg-surface-border transition-colors"
                >
                  <ExternalLink size={12} /> Verify
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
