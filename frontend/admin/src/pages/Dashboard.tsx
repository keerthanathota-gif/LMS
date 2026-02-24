import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  BookOpen,
  Users,
  GraduationCap,
  TrendingUp,
  MessageSquare,
  ArrowRight,
  Award,
  Wrench,
  CalendarDays,
  BarChart3,
} from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import Card from '@components/ui/Card'
import Badge from '@components/ui/Badge'
import { Skeleton } from '@components/ui/Skeleton'

/* -- Types ----------------------------------------------------------------- */

interface Stats {
  totalCourses: number
  publishedCourses: number
  draftCourses: number
  totalUsers: number
  totalEnrollments: number
  totalTools: number
}

interface RecentCourse {
  id: string
  title: string
  status: string
  module_count: number
  created_at: string
}

interface Tool {
  id: string
  name: string
  description?: string
}

/* -- Framer Motion helpers ------------------------------------------------- */

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/* -- Stat accent config ---------------------------------------------------- */

const statAccents = [
  {
    label: 'Total Courses',
    icon: BookOpen,
    border: 'border-l-indigo-500',
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-500',
  },
  {
    label: 'Total Learners',
    icon: Users,
    border: 'border-l-accent-emerald',
    iconBg: 'bg-accent-emerald/10',
    iconColor: 'text-accent-emerald',
  },
  {
    label: 'Active Enrollments',
    icon: Award,
    border: 'border-l-accent-amber',
    iconBg: 'bg-accent-amber/10',
    iconColor: 'text-accent-amber',
  },
  {
    label: 'Avg Completion',
    icon: BarChart3,
    border: 'border-l-accent-violet',
    iconBg: 'bg-accent-violet/10',
    iconColor: 'text-accent-violet',
  },
]

/* -- Status to Badge variant mapping --------------------------------------- */

function statusVariant(status: string): 'success' | 'warning' | 'default' {
  if (status === 'published') return 'success'
  if (status === 'draft') return 'warning'
  return 'default'
}

/* -- Color initial for course thumbnail ------------------------------------ */

const initialColors = [
  'bg-indigo-500',
  'bg-accent-emerald',
  'bg-accent-amber',
  'bg-accent-violet',
  'bg-accent-rose',
]

function courseInitialBg(index: number) {
  return initialColors[index % initialColors.length]
}

/* -- Component ------------------------------------------------------------- */

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentCourses, setRecentCourses] = useState<RecentCourse[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.orgId) return

    Promise.all([
      api.get(`/courses?orgId=${user.orgId}&limit=5`).catch(() => ({ data: { data: [] } })),
      api.get(`/users?orgId=${user.orgId}&limit=1`).catch(() => ({ data: { data: [] } })),
      api.get('/tools').catch(() => ({ data: { data: [] } })),
      api.get(`/enrollments/count?orgId=${user.orgId}`).catch(() => ({ data: { data: { total: 0 } } })),
    ]).then(([coursesRes, usersRes, toolsRes, enrollRes]) => {
      const courses: RecentCourse[] = coursesRes.data.data ?? []
      const toolList: Tool[] = toolsRes.data.data ?? []
      setRecentCourses(courses)
      setTools(toolList)
      setStats({
        totalCourses:     courses.length,
        publishedCourses: courses.filter((c) => c.status === 'published').length,
        draftCourses:     courses.filter((c) => c.status === 'draft').length,
        totalUsers:       usersRes.data.data?.length ?? 0,
        totalEnrollments: enrollRes.data.data?.total ?? 0,
        totalTools:       toolList.length,
      })
    }).finally(() => setLoading(false))
  }, [user?.orgId])

  const statValues = [
    stats?.totalCourses ?? 0,
    stats?.totalUsers ?? 0,
    stats?.totalEnrollments ?? 0,
    stats?.totalCourses
      ? `${Math.round(((stats.publishedCourses ?? 0) / stats.totalCourses) * 100)}%`
      : '0%',
  ]

  /* -- Loading skeleton --------------------------------------------------- */

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-card border border-surface-border rounded-2xl shadow-sm p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton variant="circle" className="w-10 h-10" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-surface-card border border-surface-border rounded-2xl shadow-sm p-5 space-y-4">
            <Skeleton className="h-5 w-36" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton variant="circle" className="w-9 h-9" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
          <div className="bg-surface-card border border-surface-border rounded-2xl shadow-sm p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* -- Main render -------------------------------------------------------- */

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">

      {/* Welcome header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="text-2xl font-semibold font-display text-navy-900">
          {"Welcome back, "}{user?.fullName?.split(' ')[0]}
        </h1>
        <p className="text-navy-400 text-sm mt-1">
          {"Here\u0027s what\u0027s happening in your LMS today."}
        </p>
      </motion.div>

      {/* Stat cards (4-grid) */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {statAccents.map(({ label, icon: Icon, border, iconBg, iconColor }, idx) => (
          <motion.div key={label} variants={cardVariants}>
            <Card
              className={`border-l-4 ${border} !rounded-2xl`}
              padding
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-navy-400 font-medium uppercase tracking-wider">
                  {label}
                </span>
                <div
                  className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}
                >
                  <Icon size={18} className={iconColor} />
                </div>
              </div>
              <p className="text-3xl font-bold font-display text-navy-900">
                {statValues[idx]}
              </p>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent Courses (2-col span) */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card padding={false}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-base font-semibold font-display text-navy-900">
                Recent Courses
              </h2>
              <Link
                to="/courses"
                className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
              >
                {"View all \u2192"}
              </Link>
            </div>

            {recentCourses.length === 0 ? (
              <div className="text-center py-12 px-5">
                <GraduationCap size={36} className="text-navy-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-navy-500">No courses yet</p>
                <p className="text-xs text-navy-300 mt-1">
                  Go to Chat Studio and ask the AI to create one
                </p>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {recentCourses.map((course, idx) => (
                  <div
                    key={course.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors"
                  >
                    <div
                      className={`w-9 h-9 ${courseInitialBg(idx)} rounded-lg flex items-center justify-center shrink-0`}
                    >
                      <span className="text-white text-xs font-bold">
                        {course.title.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-800 truncate">
                        {course.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-navy-400">
                          {course.module_count ?? 0} modules
                        </span>
                        <span className="text-navy-200">{"\u00B7"}</span>
                        <span className="text-xs text-navy-400 flex items-center gap-1">
                          <CalendarDays size={11} />
                          {new Date(course.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    <Badge variant={statusVariant(course.status)} dot>
                      {course.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Right column */}
        <motion.div
          className="space-y-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          {/* Quick Actions */}
          <Card>
            <h2 className="text-base font-semibold font-display text-navy-900 mb-3">
              Quick Actions
            </h2>
            <div className="space-y-2">
              <Link
                to="/chat"
                className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/15 transition-colors group"
              >
                <MessageSquare size={18} className="text-indigo-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-800">Create course with AI</p>
                  <p className="text-xs text-navy-400">Chat to build a full course</p>
                </div>
                <ArrowRight
                  size={14}
                  className="text-navy-300 group-hover:text-indigo-500 transition-colors"
                />
              </Link>

              <Link
                to="/courses"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover transition-colors group"
              >
                <BookOpen size={18} className="text-navy-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-800">Manage courses</p>
                  <p className="text-xs text-navy-400">View, edit, publish</p>
                </div>
                <ArrowRight
                  size={14}
                  className="text-navy-300 group-hover:text-navy-600 transition-colors"
                />
              </Link>

              <Link
                to="/users"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover transition-colors group"
              >
                <Users size={18} className="text-navy-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-800">Manage users</p>
                  <p className="text-xs text-navy-400">Invite and assign roles</p>
                </div>
                <ArrowRight
                  size={14}
                  className="text-navy-300 group-hover:text-navy-600 transition-colors"
                />
              </Link>
            </div>
          </Card>

          {/* Tools Available */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={14} className="text-navy-400" />
              <h2 className="text-base font-semibold font-display text-navy-900">
                Tools Available
              </h2>
              <span className="ml-auto text-xs text-navy-300 font-medium">
                {tools.length}
              </span>
            </div>

            {tools.length === 0 ? (
              <p className="text-xs text-navy-400 py-2">No tools registered.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {tools.map((tool) => (
                  <li
                    key={tool.id ?? tool.name}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-primary text-xs"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald shrink-0" />
                    <span className="text-navy-600 font-medium truncate">
                      {tool.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>

      {/* System Status */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-navy-400" />
            <h2 className="text-base font-semibold font-display text-navy-900">
              System Status
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { name: 'PostgreSQL', port: 5433 },
              { name: 'Redis', port: 6379 },
              { name: 'Mailhog', port: 8025 },
              { name: 'AI Agent', port: 3008 },
              { name: 'Tool Registry', port: 3009 },
            ].map(({ name }) => (
              <div
                key={name}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-accent-emerald/5 border border-accent-emerald/20"
              >
                <div className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
                <span className="text-xs text-navy-500 font-medium truncate">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
