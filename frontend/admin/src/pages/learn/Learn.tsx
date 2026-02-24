import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, HelpCircle, Loader2, BookOpen, RotateCcw, CheckCircle2, FileText, Clock, X, Lock } from 'lucide-react'
import api from '@services/api'
import { useProgress } from '@hooks/useProgress'
import type { Module } from '@lms-types/index'

// ── YouTube Iframe API type declarations ─────────────────────────────────────
interface YTPlayerInstance {
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string
          playerVars?: { start?: number; rel?: number; modestbranding?: number }
          events?: { onStateChange?: (e: { data: number }) => void }
        },
      ) => YTPlayerInstance
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface FullCourse {
  id: string
  title: string
  modules: Module[]
}

export default function LearnPage() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>()
  const navigate = useNavigate()

  const [course, setCourse]               = useState<FullCourse | null>(null)
  const [currentModule, setCurrentModule] = useState<Module | null>(null)
  const [hasQuiz, setHasQuiz]             = useState(false)
  const [hasQuizChecked, setHasQuizChecked] = useState(false)
  const [loading, setLoading]             = useState(true)
  const [autoPlayCountdown, setAutoPlayCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { markComplete, isComplete, saveCheckpoint } = useProgress(courseId)

  // Auto-play: start 5-second countdown when module is completed and there's a next module
  const startAutoPlay = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setAutoPlayCountdown(5)
    countdownRef.current = setInterval(() => {
      setAutoPlayCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const cancelAutoPlay = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setAutoPlayCountdown(null)
  }, [])

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

  // Re-check quiz existence whenever the module changes
  useEffect(() => {
    if (!currentModule?.id) return
    setHasQuizChecked(false)
    setHasQuiz(false)
    api.get(`/quiz/${currentModule.id}`)
      .then((res) => setHasQuiz((res.data.data ?? []).length > 0))
      .catch(() => setHasQuiz(false))
      .finally(() => setHasQuizChecked(true))
  }, [currentModule?.id])

  // Auto-complete text / pdf modules on first visit (only after we know no quiz)
  useEffect(() => {
    if (!currentModule || !hasQuizChecked || hasQuiz) return
    const { contentType } = currentModule
    if (contentType === 'youtube_embed' || contentType === 'video') return
    markComplete(currentModule.id)
  }, [currentModule?.id, hasQuiz, hasQuizChecked, markComplete])

  // Navigate to next module when countdown hits 0
  useEffect(() => {
    if (autoPlayCountdown !== null && autoPlayCountdown <= 0 && course && currentModule) {
      const idx = course.modules.findIndex((m) => m.id === currentModule.id)
      const next = idx < course.modules.length - 1 ? course.modules[idx + 1] : null
      if (next) navigate(`/learn/courses/${courseId}/module/${next.id}`)
      setAutoPlayCountdown(null)
    }
  }, [autoPlayCountdown, course, currentModule, courseId, navigate])

  // Reset countdown when module changes
  useEffect(() => { cancelAutoPlay() }, [currentModule?.id, cancelAutoPlay])

  // Wrap markComplete to also trigger auto-play (watchTimeSecs for skip detection)
  const handleModuleComplete = useCallback((modId: string, watchTimeSecs?: number) => {
    markComplete(modId, watchTimeSecs)
    if (!course) return
    const idx = course.modules.findIndex((m) => m.id === modId)
    const next = idx < course.modules.length - 1 ? course.modules[idx + 1] : null
    if (next && !hasQuiz) startAutoPlay()
  }, [markComplete, course, hasQuiz, startAutoPlay])

  // Checkpoint handler for video position saves
  const handleCheckpoint = useCallback((positionSecs: number, watchTimeSecs: number) => {
    if (!currentModule) return
    saveCheckpoint(currentModule.id, positionSecs, watchTimeSecs)
  }, [currentModule, saveCheckpoint])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-brand-400" />
    </div>
  )

  if (!course || !currentModule) return (
    <div className="p-6 text-text-secondary">Module not found.</div>
  )

  const modules      = course.modules
  const currentIndex = modules.findIndex((m) => m.id === currentModule.id)
  const prevModule   = currentIndex > 0 ? modules[currentIndex - 1] : null
  const nextModule   = currentIndex < modules.length - 1 ? modules[currentIndex + 1] : null

  // Sequential unlock: a module is locked if any previous module is incomplete
  const isSequential = (course as unknown as { is_sequential?: boolean }).is_sequential !== false
  const isModuleLocked = (index: number): boolean => {
    if (!isSequential || index === 0) return false
    // Check if ALL previous modules are complete
    for (let i = 0; i < index; i++) {
      if (!isComplete(modules[i].id)) return true
    }
    return false
  }

  const goTo = (mod: Module) => navigate(`/learn/courses/${courseId}/module/${mod.id}`)

  const completedCount = modules.filter((m) => isComplete(m.id)).length

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-surface-border flex flex-col overflow-y-auto">
        <div className="px-4 py-4 border-b border-surface-border">
          <Link to={`/learn/courses/${courseId}`} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-2">
            <ChevronLeft size={13} />
            Course overview
          </Link>
          <p className="text-sm font-semibold text-text-primary line-clamp-2">{course.title}</p>
          {/* Progress bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">{completedCount}/{modules.length} complete</span>
              <span className="text-xs text-brand-400 font-medium">
                {Math.round((completedCount / modules.length) * 100)}%
              </span>
            </div>
            <div className="h-1 bg-surface-border rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / modules.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex-1 divide-y divide-surface-border">
          {modules.map((mod, i) => {
            const locked = isModuleLocked(i)
            return (
            <button
              key={mod.id}
              onClick={() => !locked && goTo(mod)}
              disabled={locked}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                locked
                  ? 'opacity-40 cursor-not-allowed'
                  : mod.id === currentModule.id
                    ? 'bg-brand-500/10 text-brand-400'
                    : 'text-text-secondary hover:bg-surface-secondary/40'
              }`}
              title={locked ? 'Complete previous modules first' : mod.title}
            >
              <span className="w-5 h-5 bg-surface-border rounded flex items-center justify-center text-xs shrink-0">
                {locked
                  ? <Lock size={10} className="text-text-muted" />
                  : isComplete(mod.id)
                    ? <CheckCircle2 size={12} className="text-status-success" />
                    : i + 1
                }
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs truncate block">{mod.title}</span>
                {mod.durationSecs ? (
                  <span className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                    <Clock size={9} />
                    {Math.ceil(mod.durationSecs / 60)}m
                  </span>
                ) : null}
              </div>
              {isComplete(mod.id) && mod.id !== currentModule.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
              )}
            </button>
            )
          })}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
          <div>
            <p className="text-xs text-text-muted">Module {currentIndex + 1} of {modules.length}</p>
            <h1 className="text-sm font-semibold text-text-primary">{currentModule.title}</h1>
          </div>
          {hasQuiz && (
            <Link
              to={`/learn/courses/${courseId}/quiz/${currentModule.id}`}
              className="flex items-center gap-1.5 btn-primary text-xs px-3 py-1.5"
            >
              <HelpCircle size={13} />
              Take Quiz
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Video + Transcript side-by-side */}
          {currentModule.transcript && (currentModule.contentType === 'youtube_embed' || currentModule.contentType === 'video' || currentModule.contentType === 'audio') ? (
            <div className="flex gap-4 max-w-5xl mx-auto">
              <div className="flex-[7] min-w-0">
                <ModuleContent
                  module={currentModule}
                  onComplete={(watchTimeSecs) => handleModuleComplete(currentModule.id, watchTimeSecs)}
                  onCheckpoint={handleCheckpoint}
                />
              </div>
              <div className="flex-[3] min-w-[200px] max-w-[300px]">
                <TranscriptPanel transcript={currentModule.transcript} />
              </div>
            </div>
          ) : (
            <ModuleContent
              module={currentModule}
              onComplete={(watchTimeSecs) => handleModuleComplete(currentModule.id, watchTimeSecs)}
              onCheckpoint={handleCheckpoint}
            />
          )}

          {/* Discussion section below every lesson */}
          <DiscussionSection courseId={courseId!} moduleId={currentModule.id} />
        </div>

        <div className="px-6 py-4 border-t border-surface-border flex items-center justify-between">
          <button
            onClick={() => prevModule && goTo(prevModule)}
            disabled={!prevModule}
            className="flex items-center gap-2 btn-ghost disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            Previous
          </button>

          {autoPlayCountdown !== null && nextModule ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-muted">
                Next module in <span className="text-brand-400 font-bold">{autoPlayCountdown}s</span>
              </span>
              <button onClick={cancelAutoPlay} className="btn-ghost text-xs flex items-center gap-1 px-2 py-1">
                <X size={12} /> Cancel
              </button>
              <button onClick={() => { cancelAutoPlay(); goTo(nextModule) }} className="flex items-center gap-2 btn-primary text-xs">
                Next now <ChevronRight size={13} />
              </button>
            </div>
          ) : hasQuiz ? (
            <Link
              to={`/learn/courses/${courseId}/quiz/${currentModule.id}`}
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
            <Link to={`/learn/courses/${courseId}`} className="flex items-center gap-2 btn-primary text-xs">
              <BookOpen size={13} />
              Back to overview
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── YouTube player with resume + cumulative watch time tracking ──────────────
function YouTubePlayer({
  videoId, moduleId, onComplete, onCheckpoint,
}: {
  videoId: string
  moduleId: string
  onComplete?: (watchTimeSecs: number) => void
  onCheckpoint?: (positionSecs: number, watchTimeSecs: number) => void
}) {
  const playerId   = `yt-${moduleId.slice(0, 8)}`
  const storageKey = `lms_vid_${moduleId}`
  const savedTime  = parseInt(localStorage.getItem(storageKey) ?? '0', 10) || 0

  useEffect(() => {
    let player: YTPlayerInstance | null = null
    let ticker: ReturnType<typeof setInterval> | null = null
    let watchTicker: ReturnType<typeof setInterval> | null = null
    let alive = true
    let completed = false
    let cumulativeWatchTime = 0 // actual seconds watched (skip detection)

    const save = () => {
      try {
        const t = Math.floor(player?.getCurrentTime() ?? 0)
        if (t > 2) localStorage.setItem(storageKey, String(t))
      } catch { /* player not ready yet */ }
    }

    const checkCompletion = () => {
      if (completed) return
      try {
        const duration = player?.getDuration() ?? 0
        // Skip detection: use cumulative watch time (70% of actual watching required)
        if (duration > 0 && cumulativeWatchTime >= duration * 0.7) {
          completed = true
          onComplete?.(cumulativeWatchTime)
        }
        // Fallback: also complete on ENDED event (below)
      } catch { /* ignore */ }
    }

    const init = () => {
      if (!alive || !window.YT?.Player) return
      player = new window.YT.Player(playerId, {
        videoId,
        playerVars: { start: savedTime, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            const { PLAYING, PAUSED, ENDED } = window.YT.PlayerState
            if (e.data === PAUSED) {
              save()
              checkCompletion()
              // Save checkpoint to DB
              const pos = Math.floor(player?.getCurrentTime() ?? 0)
              onCheckpoint?.(pos, cumulativeWatchTime)
            }
            if (e.data === ENDED) {
              save()
              if (!completed) {
                // Only mark complete if actually watched enough (skip detection)
                const duration = player?.getDuration() ?? 0
                const threshold = duration > 0 ? duration * 0.7 : 0
                if (cumulativeWatchTime >= threshold || duration === 0) {
                  completed = true
                  onComplete?.(cumulativeWatchTime)
                }
                // If skipped to end without watching, save checkpoint but don't complete
                onCheckpoint?.(Math.floor(player?.getCurrentTime() ?? 0), cumulativeWatchTime)
              }
            }
            if (e.data === PLAYING) {
              // Start cumulative watch time counter (1-second ticks)
              if (watchTicker) clearInterval(watchTicker)
              watchTicker = setInterval(() => { cumulativeWatchTime++ }, 1000)
              // Save position + checkpoint every 10 seconds
              if (ticker) clearInterval(ticker)
              ticker = setInterval(() => {
                save()
                checkCompletion()
                const pos = Math.floor(player?.getCurrentTime() ?? 0)
                onCheckpoint?.(pos, cumulativeWatchTime)
              }, 10_000)
            } else {
              if (ticker) { clearInterval(ticker); ticker = null }
              if (watchTicker) { clearInterval(watchTicker); watchTicker = null }
            }
          },
        },
      })
    }

    if (window.YT?.Player) {
      init()
    } else {
      if (!document.getElementById('yt-api-script')) {
        const s = document.createElement('script')
        s.id  = 'yt-api-script'
        s.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(s)
      }
      window.onYouTubeIframeAPIReady = init
    }

    return () => {
      alive = false
      if (ticker) clearInterval(ticker)
      if (watchTicker) clearInterval(watchTicker)
      save()
      checkCompletion()
      const pos = Math.floor(player?.getCurrentTime() ?? 0)
      onCheckpoint?.(pos, cumulativeWatchTime)
      try { player?.destroy() } catch { /* ignore if player never initialised */ }
    }
  }, [videoId, moduleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="max-w-3xl mx-auto">
      {savedTime > 10 && (
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-brand-400">
            <RotateCcw size={11} />
            Resuming from {fmt(savedTime)}
          </span>
          <button
            onClick={() => { localStorage.removeItem(storageKey); window.location.reload() }}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Start over
          </button>
        </div>
      )}
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
        <div id={playerId} className="w-full h-full" />
      </div>
    </div>
  )
}

// ── Transcript toggle (below video) ──────────────────────────────────────────
function TranscriptToggle({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="max-w-3xl mx-auto mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors"
      >
        <FileText size={13} />
        {open ? 'Hide Transcript' : 'Show Video Transcript'}
      </button>
      {open && (
        <div className="mt-3 p-4 bg-surface-secondary rounded-xl text-xs text-text-secondary leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
          {transcript}
        </div>
      )}
    </div>
  )
}

// ── Module content renderer ───────────────────────────────────────────────────
function ModuleContent({ module: mod, onComplete, onCheckpoint }: {
  module: Module
  onComplete?: (watchTimeSecs?: number) => void
  onCheckpoint?: (positionSecs: number, watchTimeSecs: number) => void
}) {
  if (mod.contentType === 'youtube_embed' && mod.contentUrl) {
    const videoId = mod.contentUrl.includes('embed/')
      ? mod.contentUrl.split('embed/')[1]?.split('?')[0]
      : mod.contentUrl.includes('v=')
        ? mod.contentUrl.split('v=')[1]?.split('&')[0]
        : mod.contentUrl.split('/').pop()

    if (videoId) return <YouTubePlayer videoId={videoId} moduleId={mod.id} onComplete={onComplete} onCheckpoint={onCheckpoint} />
  }

  if (mod.contentType === 'video' && mod.contentUrl) {
    return (
      <div className="aspect-video w-full max-w-3xl mx-auto rounded-xl overflow-hidden bg-black">
        <video
          src={mod.contentUrl}
          controls
          className="w-full h-full"
          onEnded={() => onComplete?.()}
        />
      </div>
    )
  }

  if (mod.contentType === 'pdf' && mod.contentUrl) {
    return <iframe src={mod.contentUrl} className="w-full h-[75vh] rounded-xl border border-surface-border" title={mod.title} />
  }

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
