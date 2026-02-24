import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  BookOpen, Play, CheckCircle, Clock, ChevronLeft, Loader2, Award,
  Star, Users, BarChart3, FileText, ShieldCheck, Target, ChevronDown,
  Linkedin, Download, X, PartyPopper, Plus, MessageSquare,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import toast from 'react-hot-toast'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import type { Course, Enrollment } from '@lms-types/index'

interface ReviewStats {
  total_reviews: number
  avg_rating: number
  five: number; four: number; three: number; two: number; one: number
}

interface Review {
  id: string; rating: number; review_text: string
  full_name: string; created_at: string
}

function fmtDuration(secs: number): string {
  if (!secs) return ''
  const hrs = Math.floor(secs / 3600)
  const mins = Math.ceil((secs % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [course, setCourse]             = useState<Course | null>(null)
  const [enrollment, setEnrollment]     = useState<Enrollment | null>(null)
  const [loading, setLoading]           = useState(true)
  const [enrolling, setEnrolling]       = useState(false)
  const [reviewStats, setReviewStats]   = useState<ReviewStats | null>(null)
  const [reviews, setReviews]           = useState<Review[]>([])
  const [showAllModules, setShowAllModules] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [certificate, setCertificate] = useState<{ pdf_url: string; verify_url: string } | null>(null)

  // Review form
  const [myRating, setMyRating]         = useState(0)
  const [myReview, setMyReview]         = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Add Module inline form
  const [showAddModule, setShowAddModule] = useState(false)
  const [newModTitle, setNewModTitle]     = useState('')
  const [newModType, setNewModType]       = useState<'text' | 'youtube_embed'>('text')
  const [newModUrl, setNewModUrl]         = useState('')
  const [addingModule, setAddingModule]   = useState(false)

  const metadata = (course as unknown as { metadata?: Record<string, unknown> })?.metadata ?? {}
  const what_you_learn = (metadata.what_you_learn as string[]) ?? []
  const target_audience = (metadata.target_audience as string) ?? ''
  const prerequisites = (metadata.prerequisites as string) ?? ''
  const subtitle = (metadata.subtitle as string) ?? ''
  const level = (metadata.level as string) ?? ''

  useEffect(() => {
    if (!courseId || !user) return
    Promise.all([
      api.get(`/courses/${courseId}`),
      api.get(`/enrollments/${user.id}/${courseId}`).catch(() => ({ data: { data: null } })),
      api.get(`/courses/${courseId}/reviews`).catch(() => ({ data: { data: { reviews: [], stats: null } } })),
      api.get(`/certificates/me?user_id=${user.id}`).catch(() => ({ data: { data: [] } })),
    ])
      .then(([courseRes, enrollRes, reviewsRes, certsRes]) => {
        setCourse(courseRes.data.data)
        setEnrollment(enrollRes.data.data)
        setReviewStats(reviewsRes.data.data?.stats ?? null)
        setReviews(reviewsRes.data.data?.reviews ?? [])
        // Find certificate for this specific course
        const certs = certsRes.data.data ?? []
        const myCert = certs.find((c: { course_title: string }) =>
          courseRes.data.data?.title && c.course_title === courseRes.data.data.title
        )
        if (myCert) setCertificate({ pdf_url: myCert.pdf_url, verify_url: myCert.verify_url })
      })
      .finally(() => setLoading(false))
  }, [courseId, user])

  // Fire confetti when course is newly completed
  useEffect(() => {
    if (!enrollment || enrollment.status !== 'completed') return
    const celebratedKey = `lms_celebrated_${courseId}`
    if (localStorage.getItem(celebratedKey)) return
    localStorage.setItem(celebratedKey, '1')
    setShowCelebration(true)
    // Fire confetti burst
    const end = Date.now() + 2000
    const fire = () => {
      confetti({ particleCount: 80, spread: 100, origin: { y: 0.6 }, colors: ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'] })
      if (Date.now() < end) requestAnimationFrame(fire)
    }
    fire()
  }, [enrollment?.status, courseId])

  const handleEnroll = async () => {
    if (!user || !courseId) return
    setEnrolling(true)
    try {
      await api.post('/enrollments', { courseId, userIds: [user.id], orgId: user.orgId })
      const res = await api.get(`/enrollments/${user.id}/${courseId}`)
      setEnrollment(res.data.data)
      toast.success('Enrolled! Start learning below.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Enrollment failed — please try again.')
    } finally { setEnrolling(false) }
  }

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseId || !newModTitle.trim()) return
    setAddingModule(true)
    try {
      await api.post(`/courses/${courseId}/modules`, {
        title: newModTitle.trim(),
        contentType: newModType,
        contentUrl: newModUrl || undefined,
        sourceType: newModType,
      })
      toast.success('Module added!')
      setNewModTitle(''); setNewModUrl(''); setShowAddModule(false)
      // Reload course to show new module
      const res = await api.get(`/courses/${courseId}`)
      setCourse(res.data.data)
    } catch { toast.error('Failed to add module') }
    finally { setAddingModule(false) }
  }

  const isAdmin = user?.role === 'super_admin' || user?.role === 'org_admin' || user?.role === 'instructor'

  const handleSubmitReview = async () => {
    if (!user || !courseId || myRating === 0) return
    setSubmittingReview(true)
    try {
      await api.post(`/courses/${courseId}/reviews`, {
        userId: user.id, rating: myRating, reviewText: myReview || undefined,
      })
      const res = await api.get(`/courses/${courseId}/reviews`)
      setReviewStats(res.data.data?.stats ?? null)
      setReviews(res.data.data?.reviews ?? [])
      toast.success('Review submitted!')
    } catch { toast.error('Failed to submit review') }
    finally { setSubmittingReview(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-brand-400" />
    </div>
  )

  if (!course) return <div className="p-6 text-text-secondary">Course not found.</div>

  const modules = course.modules ?? []
  const progress = enrollment?.progressPct ?? enrollment?.progress_pct ?? 0
  const totalDuration = modules.reduce((acc, m) => acc + (m.durationSecs ?? 0), 0)
  const visibleModules = showAllModules ? modules : modules.slice(0, 5)

  return (
    <div className="min-h-full">
      {/* ── Hero Section ────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link to="/learn" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white/90 transition-colors mb-4">
            <ChevronLeft size={15} /> Back to catalog
          </Link>

          {/* Cover image */}
          {(course as unknown as { thumbnail_url?: string }).thumbnail_url && (
            <div className="mb-5 rounded-xl overflow-hidden max-w-2xl">
              <img
                src={(course as unknown as { thumbnail_url?: string }).thumbnail_url!}
                alt={course.title}
                className="w-full h-auto max-h-64 object-cover"
              />
            </div>
          )}

          {/* Tags + Level badge */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(course.skillTags ?? (course as unknown as { skill_tags?: string[] }).skill_tags ?? []).slice(0, 3).map((t) => (
              <span key={t} className="px-2 py-0.5 text-xs rounded bg-white/10 text-white/70">{t}</span>
            ))}
            {level && (
              <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                level === 'beginner' ? 'bg-green-500/20 text-green-300'
                  : level === 'advanced' ? 'bg-red-500/20 text-red-300'
                  : 'bg-yellow-500/20 text-yellow-300'
              }`}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold mb-2">{course.title}</h1>
          {subtitle && <p className="text-base text-white/70 mb-3">{subtitle}</p>}
          {course.description && (
            <p className="text-sm text-white/70 leading-relaxed mb-4 max-w-2xl">{course.description}</p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
            {reviewStats?.avg_rating && (
              <span className="flex items-center gap-1">
                <Star size={13} className="text-yellow-400 fill-yellow-400" />
                <span className="text-yellow-400 font-semibold">{reviewStats.avg_rating}</span>
                <span>({reviewStats.total_reviews} ratings)</span>
              </span>
            )}
            <span className="flex items-center gap-1"><Users size={13} /> {modules.length} modules</span>
            {totalDuration > 0 && <span className="flex items-center gap-1"><Clock size={13} /> {fmtDuration(totalDuration)} total</span>}
            {course.hasBadge && <span className="flex items-center gap-1"><Award size={13} /> Badge</span>}
            <span className="flex items-center gap-1"><FileText size={13} /> Certificate</span>
          </div>

          {/* CTA */}
          <div className="mt-5">
            {!enrollment ? (
              <button onClick={handleEnroll} disabled={enrolling}
                className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors">
                {enrolling ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {enrolling ? 'Enrolling...' : 'Enroll & Start Learning'}
              </button>
            ) : enrollment.status === 'completed' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-400 font-medium">
                  <CheckCircle size={16} /> Course completed!
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {certificate && (
                    <a
                      href={certificate.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors border border-white/20"
                    >
                      <Download size={14} /> Download Certificate
                    </a>
                  )}
                  {certificate && (
                    <a
                      href={certificate.verify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white text-xs rounded-lg transition-colors"
                    >
                      <ShieldCheck size={13} /> Verify
                    </a>
                  )}
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&title=${encodeURIComponent(`I completed "${course.title}"!`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#0077B5] hover:bg-[#006396] text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Linkedin size={13} /> Share on LinkedIn
                  </a>
                </div>
              </div>
            ) : (
              <div className="max-w-xs">
                <div className="flex items-center justify-between text-xs text-white/60 mb-1.5">
                  <span>{Math.round(progress)}% complete</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <button onClick={() => {
                  const resumeId = (enrollment as unknown as { last_module_id?: string })?.last_module_id ?? modules[0]?.id
                  navigate(`/learn/courses/${courseId}/module/${resumeId}`)
                }}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium text-sm flex items-center gap-2">
                  <Play size={13} /> {progress > 0 ? 'Continue Learning' : 'Start Learning'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Content Section ─────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* What you'll learn */}
        {what_you_learn.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Target size={15} className="text-brand-400" /> What you'll learn
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {what_you_learn.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-brand-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-text-secondary">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* This course includes */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <ShieldCheck size={15} className="text-brand-400" /> This course includes
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <BookOpen size={14} className="text-text-muted" /> {modules.length} modules
            </div>
            {totalDuration > 0 && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Clock size={14} className="text-text-muted" /> {fmtDuration(totalDuration)}
              </div>
            )}
            {course.quizCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <BarChart3 size={14} className="text-text-muted" /> {course.quizCount} questions
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <FileText size={14} className="text-text-muted" /> Certificate
            </div>
            {course.hasBadge && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Award size={14} className="text-text-muted" /> Badge
              </div>
            )}
          </div>
        </div>

        {/* Requirements & Target Audience */}
        {(prerequisites || target_audience) && (
          <div className="card p-5 space-y-4">
            {target_audience && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Who this course is for</h3>
                <p className="text-sm text-text-secondary">{target_audience}</p>
              </div>
            )}
            {prerequisites && prerequisites !== 'None' && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Requirements</h3>
                <p className="text-sm text-text-secondary">{prerequisites}</p>
              </div>
            )}
          </div>
        )}

        {/* Course Content */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              Course Content — {modules.length} modules {totalDuration > 0 && `· ${fmtDuration(totalDuration)}`}
            </h2>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddModule(!showAddModule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-400 bg-brand-500/10 rounded-lg hover:bg-brand-500/20 transition-colors"
                >
                  <Plus size={13} /> Add Module
                </button>
                <Link
                  to={`/chat?courseId=${courseId}&courseName=${encodeURIComponent(course.title)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted bg-surface-secondary rounded-lg hover:bg-surface-border transition-colors"
                >
                  <MessageSquare size={13} /> Edit in Chat
                </Link>
              </div>
            )}
          </div>

          {/* Inline Add Module Form */}
          {showAddModule && (
            <form onSubmit={handleAddModule} className="px-5 py-4 bg-surface-secondary/50 border-b border-surface-border space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  required
                  value={newModTitle}
                  onChange={(e) => setNewModTitle(e.target.value)}
                  placeholder="Module title (e.g. Introduction to React Hooks)"
                  className="flex-1 px-3 py-2 text-sm bg-surface-primary border border-surface-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <select
                  value={newModType}
                  onChange={(e) => setNewModType(e.target.value as 'text' | 'youtube_embed')}
                  className="px-3 py-2 text-sm bg-surface-primary border border-surface-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="text">Text</option>
                  <option value="youtube_embed">YouTube Video</option>
                </select>
              </div>
              {newModType === 'youtube_embed' && (
                <input
                  type="url"
                  value={newModUrl}
                  onChange={(e) => setNewModUrl(e.target.value)}
                  placeholder="YouTube URL"
                  className="w-full px-3 py-2 text-sm bg-surface-primary border border-surface-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={addingModule}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
                >
                  {addingModule && <Loader2 size={12} className="animate-spin" />}
                  Add Module
                </button>
                <button type="button" onClick={() => setShowAddModule(false)} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary">Cancel</button>
              </div>
            </form>
          )}
          <div className="divide-y divide-surface-border">
            {visibleModules.map((mod, i) => (
              <div
                key={mod.id}
                className={`flex items-center gap-4 px-5 py-3.5 ${enrollment ? 'hover:bg-surface-secondary/40 cursor-pointer' : 'opacity-60'} transition-colors`}
                onClick={() => enrollment && navigate(`/learn/courses/${courseId}/module/${mod.id}`)}
              >
                <span className="w-7 h-7 bg-brand-500/10 text-brand-400 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{mod.title}</p>
                  <p className="text-xs text-text-muted capitalize">{mod.contentType?.replace('_', ' ') ?? 'text'}</p>
                </div>
                {mod.durationSecs ? (
                  <span className="flex items-center gap-1 text-xs text-text-muted shrink-0">
                    <Clock size={11} /> {fmtDuration(mod.durationSecs)}
                  </span>
                ) : null}
                {enrollment && <Play size={14} className="text-text-muted shrink-0" />}
              </div>
            ))}
          </div>
          {modules.length > 5 && (
            <button
              onClick={() => setShowAllModules(!showAllModules)}
              className="w-full py-3 text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center justify-center gap-1 border-t border-surface-border"
            >
              <ChevronDown size={13} className={`transition-transform ${showAllModules ? 'rotate-180' : ''}`} />
              {showAllModules ? 'Show less' : `Show all ${modules.length} modules`}
            </button>
          )}
        </div>

        {/* Reviews */}
        {(reviews.length > 0 || enrollment?.status === 'completed') && (
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Star size={15} className="text-yellow-400" /> Student Reviews
              {reviewStats?.avg_rating && (
                <span className="text-text-muted font-normal ml-1">
                  {reviewStats.avg_rating} average · {reviewStats.total_reviews} reviews
                </span>
              )}
            </h2>

            {/* Star breakdown */}
            {reviewStats && reviewStats.total_reviews > 0 && (
              <div className="space-y-1">
                {([5, 4, 3, 2, 1] as const).map((star) => {
                  const key = (['', 'one', 'two', 'three', 'four', 'five'] as const)[star]
                  const count = (reviewStats[key] as number) ?? 0
                  const pct = reviewStats.total_reviews > 0 ? (count / reviewStats.total_reviews) * 100 : 0
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-8 text-text-muted text-right">{star} star</span>
                      <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-text-muted">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Write review */}
            {enrollment?.status === 'completed' && (
              <div className="pt-3 border-t border-surface-border">
                <p className="text-xs font-medium text-text-secondary mb-2">Rate this course</p>
                <div className="flex gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setMyRating(s)} className="transition-transform hover:scale-110">
                      <Star size={20} className={s <= myRating ? 'text-yellow-400 fill-yellow-400' : 'text-surface-border'} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={myReview}
                  onChange={(e) => setMyReview(e.target.value)}
                  rows={2}
                  placeholder="Write a review (optional)..."
                  className="w-full px-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 mb-2"
                />
                <button
                  onClick={handleSubmitReview}
                  disabled={myRating === 0 || submittingReview}
                  className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {submittingReview && <Loader2 size={13} className="animate-spin" />}
                  Submit Review
                </button>
              </div>
            )}

            {/* Recent reviews */}
            {reviews.slice(0, 5).map((r) => (
              <div key={r.id} className="pt-3 border-t border-surface-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text-primary">{r.full_name}</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={11} className={s <= r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-surface-border'} />
                    ))}
                  </div>
                  <span className="text-xs text-text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.review_text && <p className="text-sm text-text-secondary">{r.review_text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Completion Celebration Modal ──────────────────────────────── */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCelebration(false)} />
          <div className="relative w-full max-w-md bg-surface-primary border border-surface-border rounded-2xl shadow-2xl p-8 text-center">
            <button onClick={() => setShowCelebration(false)} className="absolute top-4 right-4 text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <PartyPopper size={28} className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Congratulations!</h2>
            <p className="text-sm text-text-secondary mb-1">
              You've completed <span className="font-semibold text-text-primary">{course.title}</span>
            </p>
            <p className="text-xs text-text-muted mb-6">
              Your certificate has been issued and is ready to download.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&title=${encodeURIComponent(`I just completed "${course.title}"! 🎓`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0077B5] hover:bg-[#006396] text-white rounded-lg font-medium text-sm transition-colors"
              >
                <Linkedin size={16} /> Share on LinkedIn
              </a>
              <Link
                to="/learn/profile"
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium text-sm transition-colors"
              >
                <Download size={14} /> View Certificate
              </Link>
              <button
                onClick={() => setShowCelebration(false)}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Continue browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
