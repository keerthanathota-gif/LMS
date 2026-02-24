import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Play, CheckCircle, Clock } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import { Card, Badge, SkeletonCard } from '@components/ui'

interface CourseRow {
  id: string
  title: string
  description?: string
  status: string
  skill_tags: string[]
  module_count: number
  enrollment?: {
    id: string
    status: string
    progress_pct: number
  }
}

export default function CatalogPage() {
  const { user } = useAuthStore()
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.orgId) return
    Promise.all([
      api.get(`/courses?orgId=${user.orgId}&limit=50`),
      api.get(`/enrollments?userId=${user.id}`),
    ])
      .then(([coursesRes, enrollRes]) => {
        const enrollments: Array<{ course_id: string; id: string; status: string; progress_pct: number }> =
          enrollRes.data.data ?? []
        const enrollMap = Object.fromEntries(enrollments.map((e) => [e.course_id, e]))

        const rows: CourseRow[] = (coursesRes.data.data ?? [])
          .filter((c: { status: string }) => c.status === 'published')
          .map((c: CourseRow) => ({ ...c, enrollment: enrollMap[c.id] }))
        setCourses(rows)
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false))
  }, [user?.orgId, user?.id])

  const enrolled  = courses.filter((c) => c.enrollment && c.enrollment.status !== 'dropped')
  const available = courses.filter((c) => !c.enrollment || c.enrollment.status === 'dropped')

  return (
    <div className="p-6 md:p-8 space-y-10 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">My Learning</h1>
        <p className="text-sm text-text-muted mt-0.5">Pick up where you left off or start something new</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <>
          {enrolled.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-indigo-500" />
                <h2 className="text-sm font-semibold font-display text-text-secondary uppercase tracking-wider">
                  In Progress ({enrolled.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {enrolled.map((c) => <CourseCard key={c.id} course={c} />)}
              </div>
            </section>
          )}

          {available.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-navy-200" />
                <h2 className="text-sm font-semibold font-display text-text-secondary uppercase tracking-wider">
                  Available ({available.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {available.map((c) => <CourseCard key={c.id} course={c} />)}
              </div>
            </section>
          )}

          {courses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <BookOpen size={28} className="text-indigo-400" />
              </div>
              <p className="text-text-primary font-bold font-display text-lg">No courses available yet</p>
              <p className="text-text-muted text-sm mt-1.5 max-w-xs">
                Ask your admin to create and publish courses for your organization
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CourseCard({ course }: { course: CourseRow }) {
  const progress  = course.enrollment?.progress_pct ?? 0
  const completed = course.enrollment?.status === 'completed'

  return (
    <Link to={`/learn/courses/${course.id}`} className="group block">
      <Card hover padding={false} className="overflow-hidden h-full flex flex-col">
        {/* Color header strip */}
        <div className={`h-1.5 w-full ${
          completed
            ? 'bg-gradient-to-r from-accent-emerald to-emerald-400'
            : course.enrollment
            ? 'bg-gradient-to-r from-indigo-500 to-indigo-400'
            : 'bg-gradient-to-r from-navy-200 to-navy-100'
        }`} />

        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              completed ? 'bg-accent-emerald/10' : 'bg-indigo-50'
            }`}>
              {completed
                ? <CheckCircle size={18} className="text-accent-emerald" />
                : <BookOpen size={18} className="text-indigo-500" />
              }
            </div>
            {completed && <Badge variant="success" dot>Completed</Badge>}
            {!completed && course.enrollment && <Badge variant="info" dot>Enrolled</Badge>}
          </div>

          <h3 className="font-semibold font-display text-text-primary text-sm leading-snug mb-1 group-hover:text-indigo-600 transition-colors line-clamp-2">
            {course.title}
          </h3>
          {course.description && (
            <p className="text-xs text-text-muted line-clamp-2 mb-3">{course.description}</p>
          )}

          {course.skill_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {course.skill_tags.slice(0, 3).map((t) => (
                <Badge key={t} variant="purple">{t}</Badge>
              ))}
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-surface-border">
            {course.enrollment ? (
              <>
                <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                  <span className="font-medium">{Math.round(progress)}% complete</span>
                  <span className="flex items-center gap-1"><Clock size={11} />{course.module_count} modules</span>
                </div>
                <div className="progress-bar h-2 rounded-full">
                  <div className="progress-fill h-full rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Play size={12} className="text-indigo-400" />
                <span>{course.module_count} modules</span>
                <span className="text-navy-200 mx-1">|</span>
                <span className="text-indigo-500 font-medium">Enroll to start</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
