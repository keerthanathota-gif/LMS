import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, ChevronLeft, Loader2, Trophy } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import type { QuizQuestion, QuizAttemptResult } from '@lms-types/index'

export default function QuizPage() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [questions, setQuestions]   = useState<QuizQuestion[]>([])
  const [answers, setAnswers]       = useState<Record<string, string>>({})
  const [result, setResult]         = useState<QuizAttemptResult | null>(null)
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currentQ, setCurrentQ]     = useState(0)

  useEffect(() => {
    if (!moduleId) return
    api.get(`/quiz/${moduleId}`)
      .then((res) => setQuestions(res.data.data ?? []))
      .finally(() => setLoading(false))
  }, [moduleId])

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
  }

  const handleSubmit = async () => {
    if (!user || !moduleId) return
    setSubmitting(true)
    try {
      const res = await api.post(`/quiz/${moduleId}/attempt`, {
        userId: user.id,
        courseId,
        answers: Object.entries(answers).map(([questionId, selectedAnswer]) => ({
          questionId,
          selectedAnswer,
        })),
      })
      setResult(res.data.data)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={24} className="animate-spin text-indigo-400" />
    </div>
  )

  if (questions.length === 0) return (
    <div className="p-6 text-center text-text-secondary">
      No quiz questions for this module yet.
    </div>
  )

  // Results screen
  if (result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 max-w-xl mx-auto space-y-6"
      >
        <div className={`card p-8 text-center ${result.passed ? 'border-accent-emerald/30' : 'border-accent-rose/30'}`}>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${result.passed ? 'bg-accent-emerald/10' : 'bg-accent-rose/10'}`}>
            {result.passed
              ? <Trophy size={32} className="text-accent-emerald" />
              : <XCircle size={32} className="text-accent-rose" />
            }
          </div>
          <h2 className="text-3xl font-bold font-display text-text-primary mb-1">{result.scorePct}%</h2>
          <p className={`text-sm font-semibold ${result.passed ? 'text-accent-emerald' : 'text-accent-rose'}`}>
            {result.passed ? 'Passed! 🎉' : 'Not quite — try again'}
          </p>
          <p className="text-xs text-text-muted mt-2">
            {result.correct} / {result.total} correct · {result.passed ? '≥70% to pass' : 'Need 70% to pass'}
          </p>
        </div>

        {/* Per-question breakdown */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            const r = result.results.find((r) => r.questionId === q.id)
            return (
              <div key={q.id} className={`card p-4 border ${r?.correct ? 'border-accent-emerald/20' : 'border-accent-rose/20'}`}>
                <div className="flex items-start gap-3">
                  {r?.correct
                    ? <CheckCircle size={16} className="text-accent-emerald shrink-0 mt-0.5" />
                    : <XCircle size={16} className="text-accent-rose shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className="text-sm text-text-primary">{i + 1}. {q.questionText}</p>
                    <p className="text-xs text-text-muted mt-1">
                      Your answer: <span className={r?.correct ? 'text-accent-emerald font-medium' : 'text-accent-rose font-medium'}>
                        {answers[q.id] ?? '—'}
                      </span>
                    </p>
                    {r?.explanation && (
                      <p className="text-xs text-text-secondary mt-1.5 italic leading-relaxed">{r.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3">
          {!result.passed && (
            <button
              onClick={() => { setResult(null); setAnswers({}); setCurrentQ(0) }}
              className="flex-1 py-2.5 px-4 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Retry
            </button>
          )}
          <button
            onClick={() => navigate(`/courses/${courseId}`)}
            className="flex-1 py-2.5 px-4 border border-surface-border text-text-secondary hover:text-text-primary hover:bg-surface-hover text-sm font-medium rounded-xl transition-colors"
          >
            Back to course
          </button>
        </div>
      </motion.div>
    )
  }

  const q           = questions[currentQ]
  const answered    = Object.keys(answers).length
  const allAnswered = answered === questions.length

  return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/courses/${courseId}/learn/${moduleId}`)}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ChevronLeft size={15} />
          Back to module
        </button>
        <span className="text-xs text-text-muted bg-surface-secondary px-2.5 py-1 rounded-full">
          {answered}/{questions.length} answered
        </span>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-indigo-500 rounded-full"
          animate={{ width: `${(answered / questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="card p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 bg-indigo-500/10 text-indigo-500 rounded-lg text-xs font-bold flex items-center justify-center shrink-0">
              {currentQ + 1}
            </span>
            <p className="text-sm font-medium text-text-primary leading-relaxed pt-0.5">{q.questionText}</p>
          </div>

          <div className="space-y-2">
            {q.options.map((opt) => {
              const selected = answers[q.id] === opt.text
              return (
                <motion.button
                  key={opt.text}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleAnswer(q.id, opt.text)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm border transition-all ${
                    selected
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 font-medium'
                      : 'border-surface-border hover:border-navy-200 text-text-secondary hover:text-text-primary hover:bg-surface-secondary/40'
                  }`}
                >
                  {opt.text}
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
          disabled={currentQ === 0}
          className="flex items-center gap-1 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors disabled:opacity-40"
        >
          <ChevronLeft size={14} />
          Prev
        </button>

        {/* Dot indicators */}
        <div className="flex-1 flex justify-center gap-1.5">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`transition-all rounded-full ${
                i === currentQ
                  ? 'w-5 h-2 bg-indigo-500'
                  : answers[questions[i].id]
                  ? 'w-2 h-2 bg-indigo-300'
                  : 'w-2 h-2 bg-surface-border'
              }`}
            />
          ))}
        </div>

        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ((q) => q + 1)}
            className="flex items-center gap-1 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors"
          >
            Next
            <ChevronLeft size={14} className="rotate-180" />
          </button>
        ) : (
          <motion.button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 shadow-sm shadow-indigo-500/20"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </motion.button>
        )}
      </div>
    </div>
  )
}
