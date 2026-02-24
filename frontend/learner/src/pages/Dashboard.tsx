import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  BookOpen, CheckCircle, Award, Zap,
  FileCheck, ArrowRight, Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import Card from '@components/ui/Card'
import Avatar from '@components/ui/Avatar'

/* ── types ─────────────────────────────────────────────────────── */
interface Enrollment {
  id: string; course_id: string; status: string; progress_pct: number
  last_module_id?: string; last_accessed_at?: string
}
interface Course {
  id: string; title: string; thumbnail_url?: string; module_count: number
  total_duration_secs: number; category_name?: string; skill_tags: string[]
}

/* ── helpers ────────────────────────────────────────────────────── */
function fmtTime(secs: number): string {
  if (!secs) return ''
  const h = Math.floor(secs / 3600), m = Math.ceil((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function hashColor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `hsl(${Math.abs(h) % 360}, 55%, 35%)`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/* ── animation variants ─────────────────────────────────────────── */
const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

/* ── skeleton components ────────────────────────────────────────── */
function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-border/50 ${className ?? ''}`} />
}

function DashboardSkeleton() {
  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Hero skeleton */}
      <div className="rounded-2xl bg-surface-card border border-surface-border p-8">
        <div className="flex items-center gap-4">
          <SkeletonPulse className="w-14 h-14 !rounded-full" />
          <div className="space-y-2 flex-1">
            <SkeletonPulse className="h-7 w-64" />
            <SkeletonPulse className="h-4 w-40" />
          </div>
        </div>
      </div>
      {/* Stat skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-surface-card border border-surface-border p-5">
            <SkeletonPulse className="w-10 h-10 mb-3" />
            <SkeletonPulse className="h-8 w-16 mb-1" />
            <SkeletonPulse className="h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Course skeletons */}
      <div>
        <SkeletonPulse className="h-5 w-44 mb-4" />
        <div className="flex gap-4 overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-surface-card border border-surface-border p-4 min-w-[280px] flex-shrink-0">
              <SkeletonPulse className="w-full h-20 mb-3" />
              <SkeletonPulse className="h-4 w-3/4 mb-2" />
              <SkeletonPulse className="h-2 w-full !rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── stat card config ───────────────────────────────────────────── */
const statCards = [
  {
    key: 'enrolled',
    label: 'Enrolled Courses',
    icon: BookOpen,
    gradient: 'from-indigo-500/15 to-indigo-500/5',
    iconBg: 'bg-indigo-500/15',
    iconColor: 'text-indigo-500',
    numberColor: 'text-indigo-600',
  },
  {
    key: 'quizzes',
    label: 'Quizzes Passed',
    icon: CheckCircle,
    gradient: 'from-emerald-500/15 to-emerald-500/5',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
    numberColor: 'text-emerald-600',
  },
  {
    key: 'xp',
    label: 'XP Earned',
    icon: Zap,
    gradient: 'from-amber-500/15 to-amber-500/5',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
    numberColor: 'text-amber-600',
  },
  {
    key: 'badges',
    label: 'Badges Earned',
    icon: Award,
    gradient: 'from-violet-500/15 to-violet-500/5',
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-500',
    numberColor: 'text-violet-600',
  },
] as const

/* ══════════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { user } = useAuthStore()
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [courses, setCourses]         = useState<Map<string, Course>>(new Map())
  const [badges, setBadges]           = useState(0)
  const [certs, setCerts]             = useState(0)
  const [xp, setXp]                   = useState(0)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    if (!user?.id) return
    Promise.all([
      api.get(`/enrollments?userId=${user.id}`).catch(() => ({ data: { data: [] } })),
      api.get(`/courses?orgId=${user.orgId}&limit=100`).catch(() => ({ data: { data: [] } })),
      api.get(`/badges/me?userId=${user.id}`).catch(() => ({ data: { data: [] } })),
      api.get(`/certificates/me?user_id=${user.id}`).catch(() => ({ data: { data: [] } })),
      api.get(`/quiz/xp/${user.id}`).catch(() => ({ data: { data: { totalXp: 0 } } })),
    ]).then(([eRes, cRes, bRes, certRes, xpRes]) => {
      setEnrollments((eRes.data.data ?? []).filter((e: Enrollment) => e.status !== 'dropped'))
      const cMap = new Map<string, Course>()
      for (const c of (cRes.data.data ?? [])) cMap.set(c.id, c)
      setCourses(cMap)
      setBadges((bRes.data.data ?? []).length)
      setCerts((certRes.data.data ?? []).length)
      setXp(xpRes.data.data?.totalXp ?? 0)
    }).finally(() => setLoading(false))
  }, [user?.id, user?.orgId])

  /* ── loading state ────────────────────────────────────────────── */
  if (loading) return <DashboardSkeleton />

  const inProgress = enrollments.filter((e) => e.status === 'active')
  const completed  = enrollments.filter((e) => e.status === 'completed')

  const statValues: Record<string, number> = {
    enrolled: enrollments.length,
    quizzes:  completed.length,
    xp,
    badges,
  }

  const firstName = user?.fullName?.split(' ')[0] ?? 'Learner'

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">

      {/* ── Welcome Hero ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-surface-card to-violet-500/5 border-indigo-500/20">
          {/* subtle decorative circles */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="relative flex items-center gap-5">
            <Avatar name={user?.fullName} size="lg" className="ring-2 ring-indigo-500/20 ring-offset-2 ring-offset-surface-card" />
            <div>
              <h1 className="text-2xl font-display font-bold text-text-primary leading-tight">
                {getGreeting()}, {firstName}!
              </h1>
              <p className="text-sm text-text-muted mt-1 flex items-center gap-1.5">
                <Sparkles size={13} className="text-indigo-400" />
                {inProgress.length > 0
                  ? `You have ${inProgress.length} course${inProgress.length > 1 ? 's' : ''} in progress — keep going!`
                  : 'Ready to start learning something new?'}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── Stat Cards ────────────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <motion.div key={card.key} variants={itemVariants}>
              <Card className={`bg-gradient-to-br ${card.gradient} border-surface-border/60`}>
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center mb-3`}>
                  <Icon size={18} className={card.iconColor} />
                </div>
                <p className={`text-2xl font-display font-bold ${card.numberColor}`}>
                  {statValues[card.key].toLocaleString()}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{card.label}</p>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      {/* ── Continue Learning ─────────────────────────────────────── */}
      {inProgress.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold text-text-primary">
              Continue Learning
            </h2>
            {inProgress.length > 3 && (
              <Link to="/library" className="text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1 transition-colors">
                View all <ArrowRight size={12} />
              </Link>
            )}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-surface-border">
            {inProgress.map((e) => {
              const c = courses.get(e.course_id)
              if (!c) return null
              const pct = e.progress_pct ?? 0
              return (
                <Link
                  key={e.id}
                  to={`/courses/${c.id}`}
                  className="min-w-[280px] max-w-[320px] flex-shrink-0 group"
                >
                  <Card hover className="h-full !p-0 overflow-hidden">
                    {/* Thumbnail */}
                    {c.thumbnail_url ? (
                      <img src={c.thumbnail_url} alt="" className="w-full h-28 object-cover" />
                    ) : (
                      <div
                        className="w-full h-28 flex items-center justify-center text-white text-3xl font-bold"
                        style={{ background: hashColor(c.title) }}
                      >
                        {c.title[0]}
                      </div>
                    )}
                    <div className="p-4">
                      <p className="text-sm font-semibold text-text-primary truncate group-hover:text-indigo-500 transition-colors">
                        {c.title}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        {c.module_count} modules
                        {c.total_duration_secs > 0 && ` · ${fmtTime(c.total_duration_secs)}`}
                      </p>
                      {/* Progress bar */}
                      <div className="mt-3 flex items-center gap-2.5">
                        <div className="flex-1 h-2 bg-surface-border rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-indigo-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
                          />
                        </div>
                        <span className="text-xs text-text-muted font-semibold tabular-nums">
                          {Math.round(pct)}%
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </motion.section>
      )}

      {/* ── Recent Achievements ───────────────────────────────────── */}
      {(completed.length > 0 || badges > 0 || certs > 0) && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
        >
          <h2 className="text-lg font-display font-semibold text-text-primary mb-4">
            Recent Achievements
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-surface-border">
            {/* Completed courses shown as achievement cards */}
            {completed.map((e) => {
              const c = courses.get(e.course_id)
              if (!c) return null
              return (
                <Link
                  key={e.id}
                  to={`/courses/${c.id}`}
                  className="min-w-[220px] max-w-[260px] flex-shrink-0 group"
                >
                  <Card hover className="h-full text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle size={24} className="text-emerald-500" />
                    </div>
                    <p className="text-sm font-semibold text-text-primary truncate group-hover:text-indigo-500 transition-colors">
                      {c.title}
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                        <CheckCircle size={11} /> Completed
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                        <FileCheck size={11} /> Certificate
                      </span>
                    </div>
                  </Card>
                </Link>
              )
            })}

            {/* Badge summary card */}
            {badges > 0 && (
              <div className="min-w-[180px] flex-shrink-0">
                <Card className="h-full text-center bg-gradient-to-br from-violet-500/10 to-violet-500/5 border-violet-500/20">
                  <div className="w-14 h-14 rounded-full bg-violet-500/15 flex items-center justify-center mx-auto mb-3">
                    <Award size={24} className="text-violet-500" />
                  </div>
                  <p className="text-2xl font-display font-bold text-violet-600">{badges}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Badge{badges !== 1 ? 's' : ''} Earned
                  </p>
                </Card>
              </div>
            )}

            {/* Certificate summary card */}
            {certs > 0 && (
              <div className="min-w-[180px] flex-shrink-0">
                <Card className="h-full text-center bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
                  <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-3">
                    <FileCheck size={24} className="text-amber-500" />
                  </div>
                  <p className="text-2xl font-display font-bold text-amber-600">{certs}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Certificate{certs !== 1 ? 's' : ''}
                  </p>
                </Card>
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* ── Empty State ───────────────────────────────────────────── */}
      {enrollments.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen size={28} className="text-indigo-500" />
            </div>
            <p className="text-base font-semibold text-text-primary mb-1">
              No courses yet
            </p>
            <p className="text-sm text-text-muted mb-4">
              Explore the library and start your learning journey.
            </p>
            <Link
              to="/library"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
            >
              Browse Library <ArrowRight size={14} />
            </Link>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
