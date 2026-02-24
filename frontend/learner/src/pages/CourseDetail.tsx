import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Play, CheckCircle, ChevronLeft, Award, Lock, GraduationCap } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import { Card, Badge, Button, Skeleton } from '@components/ui'
import type { Course, Enrollment } from '@lms-types/index'

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [course, setCourse] = useState<Course | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [prereqLocked, setPrereqLocked] = useState(false)
  const [prereqTitles, setPrereqTitles] = useState<string[]>([])

  useEffect(() => {
    if (!courseId || !user) return
    Promise.all([
      api.get(`/courses/${courseId}`),
      api.get(`/enrollments/${user.id}/${courseId}`).catch(() => ({ data: { data: null } })),
    ])
      .then(async ([courseRes, enrollRes]) => {
        const c: Course = courseRes.data.data
        setCourse(c)
        setEnrollment(enrollRes.data.data)

        const prereqIds: string[] = (c as unknown as { metadata?: { prerequisite_course_ids?: string[] } })
          ?.metadata?.prerequisite_course_ids ?? []
        if (prereqIds.length > 0 && !enrollRes.data.data) {
          const prereqResults = await Promise.all(
            prereqIds.map((id) =>
              api.get(`/enrollments/${user.id}/${id}`).catch(() => ({ data: { data: null } })),
            ),
          )
          const allCompleted = prereqResults.every(
            (r) => r.data.data?.status === 'completed',
          )
          if (!allCompleted) {
            setPrereqLocked(true)
            const titles = await Promise.all(
              prereqIds
                .filter((_id, i) => prereqResults[i].data.data?.status !== 'completed')
                .map((id) =>
                  api.get(`/courses/${id}`)
                    .then((r) => r.data.data?.title ?? 'a prerequisite course')
                    .catch(() => 'a prerequisite course'),
                ),
            )
            setPrereqTitles(titles)
          }
        }
      })
      .finally(() => setLoading(false))
  }, [courseId, user])

  const handleEnroll = async () => {
    if (!user || !courseId) return
    setEnrolling(true)
    try {
      await api.post('/enrollments', {
        courseId,
        userIds: [user.id],
        orgId: user.orgId,
      })
      const res = await api.get(`/enrollments/${user.id}/${courseId}`)
      setEnrollment(res.data.data)
    } finally {
      setEnrolling(false)
    }
  }

  if (loading) return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <Skeleton className="w-32 h-4" />
      <Skeleton className="w-full h-56 rounded-2xl" variant="card" />
      <Skeleton className="w-full h-72 rounded-2xl" variant="card" />
    </div>
  )

  if (!course) return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <Card className="p-12 text-center">
        <BookOpen size={32} className="text-navy-300 mx-auto mb-3" />
        <p className="text-navy-500 font-medium">Course not found.</p>
      </Card>
    </div>
  )

  const progress  = enrollment?.progressPct ?? 0
  const pluralS   = prereqTitles.length > 1 ? 's' : ''
  const modules   = (course as unknown as { modules?: Array<{ id: string; title: string; contentType?: string; durationSecs?: number }> })?.modules ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 md:p-8 max-w-3xl mx-auto space-y-5"
    >
      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
      >
        <ChevronLeft size={15} />
        Browse courses
      </Link>

      {/* Hero card */}
      <Card padding={false} className="overflow-hidden">
        {/* Gradient header */}
        {(course as unknown as { thumbnailUrl?: string })?.thumbnailUrl ? (
          <img
            src={(course as unknown as { thumbnailUrl?: string })?.thumbnailUrl}
            alt={course.title}
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="h-36 bg-gradient-to-br from-indigo-500 via-indigo-600 to-navy-800 flex items-center justify-center">
            <GraduationCap size={48} className="text-white/40" />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold font-display text-text-primary leading-snug">{course.title}</h1>
              {course.description && (
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{course.description}</p>
              )}
            </div>
            {enrollment?.status === 'completed' && <Badge variant="success" dot>Completed</Badge>}
            {enrollment && enrollment.status !== 'completed' && <Badge variant="info" dot>Enrolled</Badge>}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-4 text-xs text-text-muted">
            {modules.length > 0 && (
              <span className="flex items-center gap-1">
                <BookOpen size={12} />
                {modules.length} modules
              </span>
            )}
            {course.skillTags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {course.skillTags.slice(0, 3).map((t: string) => (
                  <Badge key={t} variant="purple">{t}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Progress bar (if enrolled) */}
          {enrollment && enrollment.status !== 'completed' && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-text-muted mb-1.5">
                <span>{Math.round(progress)}% complete</span>
                <span className="text-indigo-500 font-medium">{modules.filter((_, i) => i < Math.ceil(modules.length * progress / 100)).length}/{modules.length} modules</span>
              </div>
              <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-indigo-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-5">
            {prereqLocked ? (
              <div className="flex items-start gap-3 p-4 bg-accent-amber/5 border border-accent-amber/20 rounded-xl">
                <Lock size={16} className="text-accent-amber shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    Complete prerequisite course{pluralS} first
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    {prereqTitles.join(', ')}
                  </p>
                </div>
              </div>
            ) : enrollment ? (
              <Button
                variant="primary"
                onClick={() => navigate(`/courses/${courseId}/learn/${modules[0]?.id ?? ''}`)}
                className="w-full justify-center"
              >
                <Play size={15} />
                {progress > 0 ? 'Continue Learning' : 'Start Learning'}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleEnroll}
                loading={enrolling}
                className="w-full justify-center"
              >
                <Award size={15} />
                Enroll Now — Free
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Module list */}
      {modules.length > 0 && (
        <Card>
          <h2 className="text-sm font-bold font-display text-text-primary mb-4">Course Content</h2>
          <div className="space-y-1">
            {modules.map((mod, i) => (
              <div
                key={mod.id}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-secondary/50 transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-500 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{mod.title}</p>
                  {mod.contentType && (
                    <p className="text-[10px] text-text-muted mt-0.5 capitalize">
                      {mod.contentType.replace('_', ' ')}
                      {mod.durationSecs ? ` · ${Math.ceil(mod.durationSecs / 60)}m` : ''}
                    </p>
                  )}
                </div>
                {enrollment && i < Math.ceil(modules.length * progress / 100) && (
                  <CheckCircle size={14} className="text-accent-emerald shrink-0" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </motion.div>
  )
}
