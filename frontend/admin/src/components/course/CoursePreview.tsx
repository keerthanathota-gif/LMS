import { useEffect, useState } from 'react'
import { BookOpen, HelpCircle, Award, FileCheck, Clock, Loader2 } from 'lucide-react'
import type { Course } from '@lms-types/index'
import api from '@services/api'
import { useAuthStore } from '@store/auth.store'

interface CoursePreviewProps {
  courseId: string | null
}

export default function CoursePreview({ courseId }: CoursePreviewProps) {
  const { user } = useAuthStore()
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    if (courseId) {
      // Show the specific course from the current chat session
      api
        .get(`/courses/${courseId}`)
        .then((res) => setCourse(res.data.data ?? null))
        .catch(() => setCourse(null))
        .finally(() => setLoading(false))
    } else if (user?.orgId) {
      // No current-session course — show the most recently created course in this org
      api
        .get(`/courses?orgId=${user.orgId}&limit=1`)
        .then((res) => {
          const rows: Course[] = res.data.data ?? []
          setCourse(rows[0] ?? null)
        })
        .catch(() => setCourse(null))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [courseId, user?.orgId])

  return (
    <div className="w-80 shrink-0 flex flex-col bg-surface-card border-l border-surface-border">
      <div className="px-5 py-4 border-b border-surface-border">
        <h2 className="text-sm font-semibold text-text-primary">Course Preview</h2>
        <p className="text-xs text-text-muted mt-0.5">{courseId ? 'Live build progress' : 'Last created course'}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={20} className="text-brand-400 animate-spin" />
            <p className="text-xs text-text-muted">Loading course...</p>
          </div>
        ) : !course ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-10 h-10 bg-surface-border rounded-xl flex items-center justify-center mb-3">
              <BookOpen size={18} className="text-text-muted" />
            </div>
            <p className="text-text-secondary text-sm">No courses yet</p>
            <p className="text-text-muted text-xs mt-1">
              Ask the AI to create a course and it will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Course title + status */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-semibold text-text-primary leading-snug">{course.title}</h3>
                <span className={`badge shrink-0 ${course.status === 'published' ? 'badge-success' : 'badge-warning'}`}>
                  {course.status}
                </span>
              </div>
              {course.description && (
                <p className="text-xs text-text-secondary line-clamp-2">{course.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(course.skillTags ?? course.skill_tags ?? []).map((tag) => (
                  <span key={tag} className="badge badge-purple">{tag}</span>
                ))}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface-secondary rounded-xl p-3">
                <BookOpen size={14} className="text-brand-400 mb-1" />
                <p className="text-lg font-bold text-text-primary">{course.modules?.length ?? 0}</p>
                <p className="text-xs text-text-muted">Modules</p>
              </div>
              <div className="bg-surface-secondary rounded-xl p-3">
                <HelpCircle size={14} className="text-status-info mb-1" />
                <p className="text-lg font-bold text-text-primary">{course.quizCount}</p>
                <p className="text-xs text-text-muted">Questions</p>
              </div>
              <div className="bg-surface-secondary rounded-xl p-3">
                <Award size={14} className={course.hasBadge ? 'text-status-warning mb-1' : 'text-text-muted mb-1'} />
                <p className="text-sm font-medium text-text-primary">{course.hasBadge ? 'Configured' : 'Not set'}</p>
                <p className="text-xs text-text-muted">Badge</p>
              </div>
              <div className="bg-surface-secondary rounded-xl p-3">
                <FileCheck size={14} className={course.hasCertificate ? 'text-status-success mb-1' : 'text-text-muted mb-1'} />
                <p className="text-sm font-medium text-text-primary">{course.hasCertificate ? 'Configured' : 'Not set'}</p>
                <p className="text-xs text-text-muted">Certificate</p>
              </div>
            </div>

            {/* Modules list */}
            {(course.modules?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wide">Modules</p>
                <div className="space-y-1.5">
                  {(course.modules ?? []).map((mod, i) => (
                    <div
                      key={mod.id}
                      className="flex items-center gap-2.5 bg-surface-secondary rounded-xl px-3 py-2.5"
                    >
                      <span className="w-5 h-5 bg-brand-500/10 text-brand-400 rounded-md flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs text-text-primary truncate flex-1">{mod.title}</span>
                      {mod.durationSecs && (
                        <span className="flex items-center gap-1 text-xs text-text-muted shrink-0">
                          <Clock size={11} />
                          {Math.round(mod.durationSecs / 60)}m
                        </span>
                      )}
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          mod.processingStatus === 'ready'      ? 'bg-status-success' :
                          mod.processingStatus === 'processing' ? 'bg-status-warning animate-pulse' :
                          mod.processingStatus === 'failed'     ? 'bg-status-error' :
                          'bg-surface-border'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
