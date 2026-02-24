import { useEffect, useState } from 'react'
import { FileCheck, Download, ExternalLink, Loader2 } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

interface Certificate { id: string; course_title: string; org_name: string; pdf_url: string; verify_url: string; issued_at: string; expires_at?: string }

export default function CertificatesPage() {
  const { user } = useAuthStore()
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    api.get(`/certificates/me?user_id=${user.id}`)
      .then((res) => setCerts(res.data.data ?? []))
      .catch(() => setCerts([]))
      .finally(() => setLoading(false))
  }, [user?.id])

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">My Certificates</h1>
        <p className="text-sm text-text-muted mt-0.5">{certs.length} certificate{certs.length !== 1 ? 's' : ''} earned</p>
      </div>
      {certs.length === 0 ? (
        <div className="card p-12 text-center">
          <FileCheck size={36} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No certificates yet</p>
          <p className="text-xs text-text-muted mt-1">Complete all modules in a course to earn a certificate</p>
        </div>
      ) : (
        <div className="space-y-3">
          {certs.map((c) => (
            <div key={c.id} className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center shrink-0">
                <FileCheck size={20} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">{c.course_title}</p>
                <p className="text-xs text-text-muted">{c.org_name} · Issued {new Date(c.issued_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={c.pdf_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-400 bg-brand-500/10 rounded-lg hover:bg-brand-500/20 transition-colors">
                  <Download size={12} /> PDF
                </a>
                <a href={c.verify_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted bg-surface-secondary rounded-lg hover:bg-surface-border transition-colors">
                  <ExternalLink size={12} /> Verify
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
