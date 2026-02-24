import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3, Users, BookOpen, Clock, CheckCircle, AlertTriangle,
  Star, TrendingUp, Activity, Loader2,
} from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

interface Overview {
  total_courses: number
  total_enrollments: number
  total_completions: number
  completion_rate: number
  total_watch_time_secs: number
  skip_count: number
  total_module_interactions: number
}

interface CourseAnalytics {
  id: string; title: string; thumbnail_url?: string; category_name?: string
  enrollments: number; completions: number; avg_progress: number
  total_watch_secs: number; avg_rating: number; skips: number
}

interface LearnerAnalytics {
  id: string; full_name: string; email: string
  courses_enrolled: number; courses_completed: number
  total_watch_secs: number; modules_skipped: number; last_active: string
}

interface CategoryAnalytics {
  id: string; name: string; icon: string
  course_count: number; enrollment_count: number; completion_count: number; total_watch_secs: number
}

interface ActivityItem {
  type: 'enrollment' | 'completion' | 'review'
  timestamp: string; full_name: string; course_title: string; detail: string | null
}

function fmtTime(secs: number): string {
  if (!secs) return '0m'
  const hrs  = Math.floor(secs / 3600)
  const mins = Math.ceil((secs % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AnalyticsPage() {
  const { user } = useAuthStore()
  const [loading, setLoading]       = useState(true)
  const [overview, setOverview]     = useState<Overview | null>(null)
  const [courses, setCourses]       = useState<CourseAnalytics[]>([])
  const [learners, setLearners]     = useState<LearnerAnalytics[]>([])
  const [categories, setCategories] = useState<CategoryAnalytics[]>([])
  const [activity, setActivity]     = useState<ActivityItem[]>([])
  const [tab, setTab]               = useState<'courses' | 'learners' | 'categories'>('courses')

  useEffect(() => {
    if (!user?.orgId) return
    setLoading(true)
    const orgId = user.orgId
    Promise.all([
      api.get(`/courses/analytics/overview?orgId=${orgId}`).catch(() => ({ data: { data: null } })),
      api.get(`/courses/analytics/courses?orgId=${orgId}`).catch(() => ({ data: { data: [] } })),
      api.get(`/courses/analytics/learners?orgId=${orgId}`).catch(() => ({ data: { data: [] } })),
      api.get(`/courses/analytics/categories?orgId=${orgId}`).catch(() => ({ data: { data: [] } })),
      api.get(`/courses/analytics/activity?orgId=${orgId}&limit=15`).catch(() => ({ data: { data: [] } })),
    ]).then(([ovRes, cRes, lRes, catRes, actRes]) => {
      setOverview(ovRes.data.data)
      setCourses(cRes.data.data ?? [])
      setLearners(lRes.data.data ?? [])
      setCategories(catRes.data.data ?? [])
      setActivity(actRes.data.data ?? [])
    }).finally(() => setLoading(false))
  }, [user?.orgId])

  if (loading) return (
    <div className="flex items-center justify-center h-full py-20">
      <Loader2 size={24} className="animate-spin text-indigo-400" />
    </div>
  )

  const skipRate = overview && overview.total_module_interactions > 0
    ? Math.round((overview.skip_count / overview.total_module_interactions) * 100)
    : 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display text-text-primary">Analytics</h1>
        <p className="text-text-secondary text-sm mt-0.5">Course engagement, learner progress, and skip detection</p>
      </div>

      {/* ── Overview Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: BookOpen,       label: 'Published Courses',  value: overview?.total_courses ?? 0,           accent: 'bg-indigo-500/10 text-indigo-500' },
          { icon: Users,          label: 'Enrollments',        value: overview?.total_enrollments ?? 0,       accent: 'bg-accent-violet/10 text-accent-violet' },
          { icon: CheckCircle,    label: 'Completions',        value: overview?.total_completions ?? 0,       accent: 'bg-accent-emerald/10 text-accent-emerald' },
          { icon: TrendingUp,     label: 'Completion Rate',    value: `${overview?.completion_rate ?? 0}%`,   accent: 'bg-indigo-500/10 text-indigo-500' },
          { icon: Clock,          label: 'Watch Time',         value: fmtTime(overview?.total_watch_time_secs ?? 0), accent: 'bg-accent-amber/10 text-accent-amber' },
          { icon: AlertTriangle,  label: 'Skip Rate',          value: `${skipRate}%`,                        accent: skipRate > 30 ? 'bg-accent-rose/10 text-accent-rose' : skipRate > 15 ? 'bg-accent-amber/10 text-accent-amber' : 'bg-accent-emerald/10 text-accent-emerald', subtitle: `${overview?.skip_count ?? 0} skipped` },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-4"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${stat.accent}`}>
              <stat.icon size={15} />
            </div>
            <p className="text-lg font-bold text-text-primary">{stat.value}</p>
            <p className="text-xs text-text-muted leading-tight">{stat.label}</p>
            {stat.subtitle && <p className="text-[10px] text-text-muted mt-0.5">{stat.subtitle}</p>}
          </motion.div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-surface-secondary rounded-xl p-1 w-fit">
        {(['courses', 'learners', 'categories'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              tab === t
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main Table (2/3 width) ──────────────────────────────────────── */}
        <div className="lg:col-span-2 card overflow-hidden">
          {tab === 'courses' && (
            <>
              <div className="px-5 py-4 border-b border-surface-border">
                <h2 className="text-sm font-semibold font-display text-text-primary">Course Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-secondary/50">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Course</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Enrolled</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Completed</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Progress</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Watch</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Skips</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {courses.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-secondary/40 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-text-primary truncate max-w-[200px]">{c.title}</p>
                          {c.category_name && <p className="text-xs text-text-muted">{c.category_name}</p>}
                        </td>
                        <td className="text-center px-3 py-3 text-text-secondary">{c.enrollments}</td>
                        <td className="text-center px-3 py-3 text-text-secondary">{c.completions}</td>
                        <td className="text-center px-3 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 h-1.5 bg-surface-border rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.avg_progress ?? 0}%` }} />
                            </div>
                            <span className="text-xs text-text-muted">{Math.round(c.avg_progress ?? 0)}%</span>
                          </div>
                        </td>
                        <td className="text-center px-3 py-3 text-xs text-text-muted">{fmtTime(c.total_watch_secs)}</td>
                        <td className="text-center px-3 py-3">
                          {c.skips > 0
                            ? <span className="text-xs text-accent-rose font-medium">{c.skips}</span>
                            : <span className="text-xs text-text-muted">0</span>
                          }
                        </td>
                        <td className="text-center px-3 py-3">
                          {c.avg_rating ? (
                            <span className="flex items-center justify-center gap-0.5 text-xs">
                              <Star size={10} className="text-accent-amber fill-accent-amber" />
                              {c.avg_rating}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {courses.length === 0 && (
                      <tr><td colSpan={7} className="py-10 text-center text-sm text-text-muted">No published courses yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'learners' && (
            <>
              <div className="px-5 py-4 border-b border-surface-border">
                <h2 className="text-sm font-semibold font-display text-text-primary">Learner Engagement</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-secondary/50">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Learner</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Enrolled</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Completed</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Watch</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Skipped</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {learners.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-secondary/40 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-text-primary">{l.full_name}</p>
                          <p className="text-xs text-text-muted">{l.email}</p>
                        </td>
                        <td className="text-center px-3 py-3 text-text-secondary">{l.courses_enrolled}</td>
                        <td className="text-center px-3 py-3 text-text-secondary">{l.courses_completed}</td>
                        <td className="text-center px-3 py-3 text-xs text-text-muted">{fmtTime(l.total_watch_secs)}</td>
                        <td className="text-center px-3 py-3">
                          {l.modules_skipped > 0
                            ? <span className="text-xs text-accent-rose font-medium">{l.modules_skipped}</span>
                            : <span className="text-xs text-accent-emerald">0</span>
                          }
                        </td>
                        <td className="text-center px-3 py-3 text-xs text-text-muted">
                          {l.last_active ? timeAgo(l.last_active) : 'Never'}
                        </td>
                      </tr>
                    ))}
                    {learners.length === 0 && (
                      <tr><td colSpan={6} className="py-10 text-center text-sm text-text-muted">No learner data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'categories' && (
            <>
              <div className="px-5 py-4 border-b border-surface-border">
                <h2 className="text-sm font-semibold font-display text-text-primary">Category Engagement</h2>
              </div>
              <div className="divide-y divide-surface-border">
                {categories.map((cat) => {
                  const compRate = cat.enrollment_count > 0
                    ? Math.round((cat.completion_count / cat.enrollment_count) * 100)
                    : 0
                  return (
                    <div key={cat.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary/40 transition-colors">
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                        <BarChart3 size={16} className="text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">{cat.name}</p>
                        <p className="text-xs text-text-muted">
                          {cat.course_count} courses · {cat.enrollment_count} enrollments · {compRate}% completion
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-text-primary">{fmtTime(cat.total_watch_secs)}</p>
                        <p className="text-xs text-text-muted">watch time</p>
                      </div>
                    </div>
                  )
                })}
                {categories.length === 0 && (
                  <div className="py-10 text-center text-sm text-text-muted">No categorized courses yet</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Activity Feed (1/3 width) ──────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
            <Activity size={14} className="text-indigo-500" />
            <h2 className="text-sm font-semibold font-display text-text-primary">Recent Activity</h2>
          </div>
          <div className="divide-y divide-surface-border max-h-[500px] overflow-y-auto">
            {activity.map((a, i) => (
              <div key={i} className="px-5 py-3 hover:bg-surface-secondary/30 transition-colors">
                <div className="flex items-start gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    a.type === 'completion' ? 'bg-accent-emerald/10'
                      : a.type === 'review' ? 'bg-accent-amber/10'
                      : 'bg-indigo-500/10'
                  }`}>
                    {a.type === 'completion' ? <CheckCircle size={10} className="text-accent-emerald" />
                      : a.type === 'review' ? <Star size={10} className="text-accent-amber" />
                      : <Users size={10} className="text-indigo-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-primary leading-relaxed">
                      <span className="font-semibold">{a.full_name}</span>
                      {a.type === 'enrollment' && ' enrolled in '}
                      {a.type === 'completion' && ' completed '}
                      {a.type === 'review' && ` rated ${a.detail}★ on `}
                      <span className="text-indigo-500">{a.course_title}</span>
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">{timeAgo(a.timestamp)}</p>
                  </div>
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <div className="py-10 text-center text-xs text-text-muted">No activity yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
