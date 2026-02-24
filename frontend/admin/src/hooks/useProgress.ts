import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

/**
 * Tracks per-module completion for a course enrollment.
 *
 * Completion is stored in both localStorage (fast cache) and the DB
 * (source of truth via module_progress table). Supports:
 *  - saveCheckpoint(moduleId, positionSecs, watchTimeSecs) for resume
 *  - markComplete(moduleId, watchTimeSecs) with skip detection
 *  - isComplete(moduleId) checks both localStorage and DB data
 */
export function useProgress(courseId: string | undefined) {
  const { user } = useAuthStore()

  const [enrollmentId, setEnrollmentId] = useState<string | null>(null)
  const [totalModules, setTotalModules] = useState(0)
  const [dbCompleted, setDbCompleted]   = useState<Set<string>>(new Set())

  const enrollmentIdRef = useRef<string | null>(null)
  const totalModulesRef = useRef(0)
  enrollmentIdRef.current = enrollmentId
  totalModulesRef.current = totalModules

  const storageKey = `lms_done_${user?.id ?? 'anon'}_${courseId ?? ''}`

  // ── Load enrollment + module count + DB progress on mount ───────────────
  useEffect(() => {
    if (!user?.id || !courseId) return

    api.get(`/enrollments/${user.id}/${courseId}`)
      .then((res) => {
        const id: string | undefined = res.data.data?.id
        setEnrollmentId(id ?? null)
      })
      .catch(() => {})

    api.get(`/courses/${courseId}`)
      .then((res) => {
        const count: number = (res.data.data?.modules ?? []).length
        setTotalModules(count)
      })
      .catch(() => {})

    // Load per-module progress from DB
    api.get(`/enrollments/${user.id}/${courseId}/progress`)
      .then((res) => {
        const rows: Array<{ module_id: string; status: string }> = res.data.data ?? []
        const completed = new Set(rows.filter((r) => r.status === 'completed').map((r) => r.module_id))
        setDbCompleted(completed)

        // Sync DB → localStorage (merge, don't overwrite)
        try {
          const raw = localStorage.getItem(storageKey)
          const local = new Set<string>(raw ? JSON.parse(raw) : [])
          completed.forEach((id) => local.add(id))
          localStorage.setItem(storageKey, JSON.stringify([...local]))
        } catch { /* ignore */ }
      })
      .catch(() => {})
  }, [user?.id, courseId, storageKey])

  // ── Helpers ─────────────────────────────────────────────────────────────
  const getCompleted = useCallback((): Set<string> => {
    try {
      const raw = localStorage.getItem(storageKey)
      const local = new Set<string>(raw ? JSON.parse(raw) : [])
      // Merge DB-completed into local
      dbCompleted.forEach((id) => local.add(id))
      return local
    } catch {
      return new Set(dbCompleted)
    }
  }, [storageKey, dbCompleted])

  const isComplete = useCallback(
    (moduleId: string) => getCompleted().has(moduleId),
    [getCompleted],
  )

  // ── Save checkpoint (called every ~10s during video playback) ──────────
  const saveCheckpoint = useCallback(async (moduleId: string, positionSecs: number, watchTimeSecs?: number) => {
    const eid = enrollmentIdRef.current
    if (!eid) return
    try {
      await api.post(`/enrollments/${eid}/checkpoint`, {
        moduleId,
        positionSecs,
        watchTimeSecs: watchTimeSecs ?? 0,
      })
    } catch { /* non-critical */ }
  }, [])

  // ── Mark module complete (with skip detection via watchTimeSecs) ────────
  const markComplete = useCallback(async (moduleId: string, watchTimeSecs?: number) => {
    const eid   = enrollmentIdRef.current
    const total = totalModulesRef.current
    if (!eid || total === 0) return

    const done = getCompleted()
    if (done.has(moduleId)) return

    // Optimistic: update localStorage immediately
    done.add(moduleId)
    localStorage.setItem(storageKey, JSON.stringify([...done]))

    try {
      // Call the new module-complete endpoint with skip detection
      await api.post(`/enrollments/${eid}/module-complete`, {
        moduleId,
        watchTimeSecs: watchTimeSecs ?? 0,
      })
      setDbCompleted((prev) => new Set([...prev, moduleId]))
    } catch (err: unknown) {
      // If skip detection rejected it, revert localStorage
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400) {
        done.delete(moduleId)
        localStorage.setItem(storageKey, JSON.stringify([...done]))
      }
      // For other errors, keep localStorage optimistic — DB will sync later
    }
  }, [storageKey, getCompleted])

  return { markComplete, isComplete, enrollmentId, totalModules, saveCheckpoint }
}
