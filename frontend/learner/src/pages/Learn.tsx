import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, HelpCircle, Loader2, BookOpen, Volume2 } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import type { Module } from '@lms-types/index'

// ── Video/Audio resume helpers (localStorage, keyed by userId + moduleId) ──────
function getProgressKey(userId: string, moduleId: string) {
  return `lms_video_pos_${userId}_${moduleId}`
}
function saveVideoProgress(userId: string, moduleId: string, time: number) {
  try { localStorage.setItem(getProgressKey(userId, moduleId), String(time)) } catch { /* ignore */ }
}
function loadVideoProgress(userId: string, moduleId: string): number {
  try { return parseFloat(localStorage.getItem(getProgressKey(userId, moduleId)) ?? '0') || 0 } catch { return 0 }
}

interface FullCourse {
  id: string
  title: string
  modules: Module[]
}

export default function LearnPage() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [course, setCourse] = useState<FullCourse | null>(null)
  const [currentModule, setCurrentModule] = useState<Module | null>(null)
  const [hasQuiz, setHasQuiz] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!courseId) return
    api.get(`/courses/${courseId}`)
      .then((res) => {
        const c: FullCourse = res.data.data
        setCourse(c)
        const mod = c.modules.find((m) => m.id === moduleId) ?? c.modules[0]
        setCurrentModule(mod ?? null)
      })
      .finally(() => setLoading(false))
  }, [courseId, moduleId])

  useEffect(() => {
    if (!currentModule?.id) return
    api.get(`/quiz/${currentModule.id}`)
      .then((res) => setHasQuiz((res.data.data ?? []).length > 0))
      .catch(() => setHasQuiz(false))
  }, [currentModule?.id])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-brand-400" />
    </div>
  )

  if (!course || !currentModule) return (
    <div className="p-6 text-text-secondary">Module not found.</div>
  )

  const modules = course.modules
  const currentIndex = modules.findIndex((m) => m.id === currentModule.id)
  const prevModule = currentIndex > 0 ? modules[currentIndex - 1] : null
  const nextModule = currentIndex < modules.length - 1 ? modules[currentIndex + 1] : null

  const goTo = (mod: Module) => navigate(`/courses/${courseId}/learn/${mod.id}`)

  return (
    <div className="flex h-full">
      {/* Sidebar — module list */}
      <aside className="w-64 shrink-0 border-r border-surface-border flex flex-col overflow-y-auto">
        <div className="px-4 py-4 border-b border-surface-border">
          <Link to={`/courses/${courseId}`} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-2">
            <ChevronLeft size={13} />
            Course overview
          </Link>
          <p className="text-sm font-semibold text-text-primary line-clamp-2">{course.title}</p>
        </div>
        <div className="flex-1 divide-y divide-surface-border">
          {modules.map((mod, i) => (
            <button
              key={mod.id}
              onClick={() => goTo(mod)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                mod.id === currentModule.id
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-text-secondary hover:bg-surface-secondary/40'
              }`}
            >
              <span className="w-5 h-5 bg-surface-border rounded flex items-center justify-center text-xs shrink-0">
                {i + 1}
              </span>
              <span className="text-xs truncate">{mod.title}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
          <div>
            <p className="text-xs text-text-muted">Module {currentIndex + 1} of {modules.length}</p>
            <h1 className="text-sm font-semibold text-text-primary">{currentModule.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {hasQuiz && (
              <Link
                to={`/courses/${courseId}/quiz/${currentModule.id}`}
                className="flex items-center gap-1.5 btn-primary text-xs px-3 py-1.5"
              >
                <HelpCircle size={13} />
                Take Quiz
              </Link>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          <ModuleContent module={currentModule} userId={user?.id} />
        </div>

        {/* Navigation */}
        <div className="px-6 py-4 border-t border-surface-border flex items-center justify-between">
          <button
            onClick={() => prevModule && goTo(prevModule)}
            disabled={!prevModule}
            className="flex items-center gap-2 btn-ghost disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            Previous
          </button>

          {hasQuiz ? (
            <Link
              to={`/courses/${courseId}/quiz/${currentModule.id}`}
              className="flex items-center gap-1.5 btn-primary text-xs"
            >
              <HelpCircle size={13} />
              Take quiz to continue
            </Link>
          ) : nextModule ? (
            <button onClick={() => goTo(nextModule)} className="flex items-center gap-2 btn-primary text-xs">
              Next
              <ChevronRight size={13} />
            </button>
          ) : (
            <Link to={`/courses/${courseId}`} className="flex items-center gap-2 btn-primary text-xs">
              <BookOpen size={13} />
              Back to overview
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function ModuleContent({ module: mod, userId }: { module: Module; userId?: string }) {

  // ── YouTube embed (with resume via startSeconds) ─────────────────────────
  if (mod.contentType === 'youtube_embed' && mod.contentUrl) {
    const videoId = mod.contentUrl.includes('embed/')
      ? mod.contentUrl.split('embed/')[1]?.split('?')[0]
      : mod.contentUrl.includes('v=')
        ? mod.contentUrl.split('v=')[1]?.split('&')[0]
        : mod.contentUrl.split('/').pop()

    const savedPos = userId ? loadVideoProgress(userId, mod.id) : 0
    const startParam = savedPos > 10 ? `?start=${Math.floor(savedPos)}` : ''

    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}${startParam}`}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            title={mod.title}
          />
        </div>
        {savedPos > 10 && (
          <p className="text-xs text-text-muted text-center">
            Resuming from {Math.floor(savedPos / 60)}m {Math.floor(savedPos % 60)}s
          </p>
        )}
      </div>
    )
  }

  // ── Hosted video (HTML5 player with resume) ───────────────────────────────
  if (mod.contentType === 'video' && mod.contentUrl) {
    return (
      <VideoPlayer moduleId={mod.id} src={mod.contentUrl} userId={userId} title={mod.title} />
    )
  }

  // ── Audio / podcast episode (HTML5 audio with resume) ────────────────────
  if (mod.contentType === 'audio' && mod.contentUrl) {
    return (
      <AudioPlayer moduleId={mod.id} src={mod.contentUrl} userId={userId} transcript={mod.transcript} />
    )
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  if (mod.contentType === 'pdf' && mod.contentUrl) {
    return (
      <iframe
        src={mod.contentUrl}
        className="w-full h-[75vh] rounded-xl border border-surface-border"
        title={mod.title}
      />
    )
  }

  // ── Text / transcript fallback ────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {mod.transcript ? (
        <div className="prose prose-sm max-w-none text-text-secondary leading-relaxed whitespace-pre-wrap">
          {mod.transcript}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen size={36} className="text-text-muted mb-3" />
          <p className="text-text-secondary font-medium">{mod.title}</p>
          <p className="text-text-muted text-sm mt-1">No content available for this module yet.</p>
        </div>
      )}
    </div>
  )
}

// ── Video player with Netflix-style resume ────────────────────────────────────
function VideoPlayer({ moduleId, src, userId, title }: { moduleId: string; src: string; userId?: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const savedPos = userId ? loadVideoProgress(userId, moduleId) : 0
  const [resumeBanner, setResumeBanner] = useState(savedPos > 10)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (savedPos > 10) {
      v.currentTime = savedPos
    }
  }, [savedPos])

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !userId) return
    // Save every 5 seconds to avoid excessive writes
    if (Math.floor(v.currentTime) % 5 === 0) {
      saveVideoProgress(userId, moduleId, v.currentTime)
    }
  }

  const handlePlay = () => setResumeBanner(false)

  return (
    <div className="max-w-3xl mx-auto space-y-2">
      {resumeBanner && (
        <div className="flex items-center justify-between bg-surface-card border border-surface-border rounded-lg px-4 py-2 text-xs text-text-secondary">
          <span>Resuming from {Math.floor(savedPos / 60)}m {Math.floor(savedPos % 60)}s</span>
          <button
            onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; setResumeBanner(false) }}
            className="text-brand-400 hover:text-brand-300"
          >
            Start from beginning
          </button>
        </div>
      )}
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          className="w-full h-full"
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          title={title}
        />
      </div>
    </div>
  )
}

// ── Audio player with resume ──────────────────────────────────────────────────
function AudioPlayer({ moduleId, src, userId, transcript }: { moduleId: string; src: string; userId?: string; transcript?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const savedPos = userId ? loadVideoProgress(userId, moduleId) : 0
  const [resumeBanner, setResumeBanner] = useState(savedPos > 5)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (savedPos > 5) a.currentTime = savedPos
  }, [savedPos])

  const handleTimeUpdate = () => {
    const a = audioRef.current
    if (!a || !userId) return
    if (Math.floor(a.currentTime) % 5 === 0) {
      saveVideoProgress(userId, moduleId, a.currentTime)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {resumeBanner && (
        <div className="flex items-center justify-between bg-surface-card border border-surface-border rounded-lg px-4 py-2 text-xs text-text-secondary">
          <span>Resuming from {Math.floor(savedPos / 60)}m {Math.floor(savedPos % 60)}s</span>
          <button
            onClick={() => { if (audioRef.current) audioRef.current.currentTime = 0; setResumeBanner(false) }}
            className="text-brand-400 hover:text-brand-300"
          >
            Start from beginning
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl px-5 py-4">
        <Volume2 size={20} className="text-brand-400 shrink-0" />
        <audio
          ref={audioRef}
          src={src}
          controls
          className="flex-1 h-10"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setResumeBanner(false)}
        />
      </div>
      {transcript && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Transcript</p>
          <div className="prose prose-sm max-w-none text-text-secondary leading-relaxed whitespace-pre-wrap bg-surface-card border border-surface-border rounded-xl p-4 max-h-64 overflow-y-auto">
            {transcript}
          </div>
        </div>
      )}
    </div>
  )
}
