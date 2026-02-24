import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, UserPlus, X, Loader2 } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import type { Role } from '@lms-types/index'
import Avatar from '@components/ui/Avatar'

interface OrgUser {
  id: string
  email: string
  full_name: string
  role: Role
  created_at: string
  avatar_url?: string
}

const ROLES: Role[] = ['org_admin', 'instructor', 'ta', 'learner']

const roleBadgeStyle: Record<Role, string> = {
  super_admin: 'bg-navy-100 text-navy-500',
  org_admin:   'bg-accent-amber/10 text-accent-amber',
  instructor:  'bg-indigo-500/10 text-indigo-600',
  ta:          'bg-navy-100 text-navy-500',
  learner:     'bg-accent-emerald/10 text-accent-emerald',
}

export default function UsersPage() {
  const { user } = useAuthStore()
  const [users, setUsers]               = useState<OrgUser[]>([])
  const [loading, setLoading]           = useState(true)
  const [showInvite, setShowInvite]     = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError]   = useState('')
  const [roleLoading, setRoleLoading]   = useState<string | null>(null)

  const [form, setForm] = useState({ email: '', fullName: '', role: 'learner' as Role })

  const fetchUsers = () => {
    if (!user?.orgId) return
    setLoading(true)
    api
      .get(`/users?orgId=${user.orgId}&limit=100`)
      .then((res) => setUsers(res.data.data ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [user?.orgId])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.orgId) return
    setInviteLoading(true)
    setInviteError('')
    try {
      await api.post('/users', {
        orgId: user.orgId,
        email: form.email,
        fullName: form.fullName,
        role: form.role,
      })
      setShowInvite(false)
      setForm({ email: '', fullName: '', role: 'learner' })
      fetchUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create user'
      setInviteError(msg)
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setRoleLoading(userId)
    try {
      await api.post(`/users/${userId}/roles`, { role: newRole })
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      )
    } finally {
      setRoleLoading(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display text-text-primary">Users</h1>
          <p className="text-text-secondary text-sm mt-0.5">{users.length} members in your organization</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium shadow-sm shadow-indigo-500/20 transition-colors"
        >
          <UserPlus size={15} />
          Invite user
        </motion.button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-surface-border">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 bg-surface-border rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-surface-border rounded animate-pulse w-36" />
                  <div className="h-3 bg-surface-border rounded animate-pulse w-52" />
                </div>
                <div className="h-5 w-20 bg-surface-border rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Users size={24} className="text-indigo-400" />
            </div>
            <p className="text-sm font-semibold text-text-secondary mb-1">No users yet</p>
            <p className="text-xs text-text-muted mb-4">Invite your first team member</p>
            <button
              onClick={() => setShowInvite(true)}
              className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
            >
              + Invite user
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-secondary/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider hidden md:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-secondary/40 transition-colors">
                  {/* Name + Avatar */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} size="sm" />
                      <span className="font-medium text-text-primary truncate max-w-[160px]">{u.full_name}</span>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-4 py-4 text-text-secondary hidden sm:table-cell truncate max-w-[200px]">
                    {u.email}
                  </td>

                  {/* Role selector */}
                  <td className="px-4 py-4">
                    {u.id === user?.id ? (
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${roleBadgeStyle[u.role]}`}>
                        {u.role}
                      </span>
                    ) : (
                      <div className="relative inline-block">
                        {roleLoading === u.id && (
                          <Loader2 size={12} className="absolute right-6 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />
                        )}
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                          disabled={roleLoading === u.id}
                          className="appearance-none text-xs px-2.5 py-1 pr-6 rounded-full border border-surface-border bg-surface-secondary text-text-secondary focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 cursor-pointer transition-all"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>

                  {/* Joined */}
                  <td className="px-4 py-4 text-text-muted text-xs hidden md:table-cell">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              className="bg-surface-primary border border-surface-border rounded-2xl shadow-2xl w-full max-w-md mx-4"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                <h2 className="text-sm font-bold font-display text-text-primary">Invite user</h2>
                <button
                  onClick={() => { setShowInvite(false); setInviteError('') }}
                  className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal body */}
              <form onSubmit={handleInvite} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Full name</label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full px-3.5 py-2.5 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Email</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jane@company.com"
                    className="w-full px-3.5 py-2.5 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {inviteError && (
                  <p className="text-xs text-accent-rose bg-accent-rose/10 border border-accent-rose/20 rounded-xl px-4 py-2.5">
                    {inviteError}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowInvite(false); setInviteError('') }}
                    className="flex-1 px-3 py-2.5 text-sm font-medium text-text-secondary border border-surface-border rounded-xl hover:bg-surface-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <motion.button
                    type="submit"
                    disabled={inviteLoading}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors disabled:opacity-50 shadow-sm shadow-indigo-500/20"
                  >
                    {inviteLoading && <Loader2 size={13} className="animate-spin" />}
                    {inviteLoading ? 'Creating...' : 'Create user'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
