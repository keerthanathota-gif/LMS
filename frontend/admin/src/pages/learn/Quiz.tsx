import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, ChevronLeft, Loader2, Trophy } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import { useProgress } from '@hooks/useProgress'
import type { QuizQuestion, QuizAttemptResult } from '@lms-types/index'

export default function QuizPage() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { markComplete } = useProgress(courseId)

  const [questions, setQuestions]     = useState<QuizQuestion[]>([])
  const [answers, setAnswers]         = useState<Record<string, string>>({})
  const [result, setResult]           = useState<QuizAttemptResult | null>(null)
  const [loading, setLoading]         = useState(true)
  const [submitting, setSubmitting]   = useState(false)
  const [currentQ, setCurrentQ]       = useState(0)

  useEffect(() => {
    if (!moduleId) return
    api.get(`/quiz/${moduleId}`)
      .then((res) => setQuestions(res.data.data ?? []))
      .finally(() => setLoading(false))
  }, [moduleId])

  const handleSubmit = async () => {
    if (!user || !moduleId) return
    setSubmitting(true)
    try {
      const res = await api.post(`/quiz/${moduleId}/attempt`, {
        userId: user.id,
        courseId,
        answers: Object.entries(answers).map(([questionId, selectedAnswer]) => ({ questionId, selectedAnswer })),
      })
      const attemptResult: QuizAttemptResult = res.data.data
      setResult(attemptResult)
      if (attemptResult.passed && moduleId) {
        markComplete(moduleId)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-brand-400" />
    </div>
  )

  if (questions.length === 0) return (
    <div className="p-6 text-center text-text-secondary">No quiz questions for this module yet.</div>
  )

  if (result) {
    return (
      <div className="p-6 max-w-xl mx-auto space-y-6">
        <div className={`card p-8 text-center ${result.passed ? 'border-status-success/30' : 'border-status-error/30'}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${result.passed ? 'bg-status-success/10' : 'bg-status-error/10'}`}>
            {result.passed
              ? <Trophy size={28} className="text-status-success" />
              : <XCircle size={28} className="text-status-error" />
            }
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-1">{result.scorePct}%</h2>
          <p className={`text-sm font-medium ${result.passed ? 'text-status-success' : 'text-status-error'}`}>
            {result.passed ? 'Passed! 🎉' : 'Not quite — try again'}
          </p>
          <p className="text-xs text-text-muted mt-2">
            {result.correct} / {result.total} correct
          </p>
        </div>

        <div className="space-y-3">
          {questions.map((q, i) => {
            const r = result.results.find((r) => r.questionId === q.id)
            return (
              <div key={q.id} className={`card p-4 border ${r?.correct ? 'border-status-success/20' : 'border-status-error/20'}`}>
                <div className="flex items-start gap-3">
                  {r?.correct
                    ? <CheckCircle size={16} className="text-status-success shrink-0 mt-0.5" />
                    : <XCircle size={16} className="text-status-error shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className="text-sm text-text-primary">{i + 1}. {q.questionText}</p>
                    <p className="text-xs text-text-muted mt-1">Your answer: <span className={r?.correct ? 'text-status-success' : 'text-status-error'}>{answers[q.id] ?? '—'}</span></p>
                    {r?.explanation && <p className="text-xs text-text-secondary mt-1 italic">{r.explanation}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3">
          {!result.passed && (
            <button onClick={() => { setResult(null); setAnswers({}); setCurrentQ(0) }} className="btn-primary flex-1">
              Retry
            </button>
          )}
          <button onClick={() => navigate(`/learn/courses/${courseId}`)} className="btn-ghost flex-1">
            Back to course
          </button>
        </div>
      </div>
    )
  }

  const q          = questions[currentQ]
  const answered   = Object.keys(answers).length
  const allAnswered = answered === questions.length

  return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/learn/courses/${courseId}/module/${moduleId}`)}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ChevronLeft size={15} />
          Back to module
        </button>
        <span className="text-xs text-text-muted">{answered}/{questions.length} answered</span>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(answered / questions.length) * 100}%` }} />
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-6 h-6 bg-brand-500/10 text-brand-400 rounded text-xs font-bold flex items-center justify-center shrink-0">
            {currentQ + 1}
          </span>
          <p className="text-sm font-medium text-text-primary leading-relaxed">{q.questionText}</p>
        </div>

        <div className="space-y-2">
          {q.options.map((opt) => {
            const selected = answers[q.id] === opt.text
            return (
              <button
                key={opt.text}
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.text }))}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm border transition-all ${
                  selected
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                    : 'border-surface-border hover:border-surface-hover text-text-secondary hover:text-text-primary hover:bg-surface-secondary/40'
                }`}
              >
                {opt.text}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setCurrentQ((q) => Math.max(0, q - 1))} disabled={currentQ === 0} className="btn-ghost flex items-center gap-1 disabled:opacity-40">
          <ChevronLeft size={14} />
          Prev
        </button>

        <div className="flex-1 flex justify-center gap-1.5">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentQ ? 'bg-brand-400' : answers[questions[i].id] ? 'bg-brand-500/40' : 'bg-surface-border'
              }`}
            />
          ))}
        </div>

        {currentQ < questions.length - 1 ? (
          <button onClick={() => setCurrentQ((q) => q + 1)} className="btn-ghost flex items-center gap-1">
            Next
            <ChevronLeft size={14} className="rotate-180" />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={!allAnswered || submitting} className="btn-primary flex items-center gap-1.5 disabled:opacity-40">
            {submitting && <Loader2 size={13} className="animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        )}
      </div>
    </div>
  )
}
