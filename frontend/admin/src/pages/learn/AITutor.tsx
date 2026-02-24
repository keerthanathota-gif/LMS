import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useAuthStore } from '@store/auth.store'

interface LearnerChatMessage {
  id: string
  role: 'learner' | 'assistant'
  content: string
  timestamp: string
  isStreaming?: boolean
}

const SUGGESTIONS = [
  "Explain the key concepts from my last module",
  "Quiz me on what I've learned so far",
  "What should I focus on next?",
]

export default function AITutorPage() {
  const { user, accessToken } = useAuthStore()
  const [messages, setMessages]       = useState<LearnerChatMessage[]>([])
  const [input, setInput]             = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [input])

  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming || !content.trim()) return

    const userMsg: LearnerChatMessage = {
      id: crypto.randomUUID(), role: 'learner', content, timestamp: new Date().toISOString(),
    }
    const aiId = crypto.randomUUID()
    const aiMsg: LearnerChatMessage = {
      id: aiId, role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true,
    }

    setMessages((prev) => [...prev, userMsg, aiMsg])
    setIsStreaming(true)

    try {
      const res = await fetch('/api/companion/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          message:    content,
          user_id:    user?.id ?? 'learner',
          org_id:     user?.orgId ?? 'dev',
          session_id: sessionIdRef.current,
        }),
      })

      if (!res.ok) throw new Error('Failed to connect')
      const body = await res.json()
      sessionIdRef.current = body.session_id ?? body.sessionId

      const es = new EventSource(`/api/companion/chat/${sessionIdRef.current}/stream`)

      es.addEventListener('token', (e) => {
        setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: m.content + e.data } : m))
      })
      es.addEventListener('done', () => {
        setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, isStreaming: false } : m))
        setIsStreaming(false)
        es.close()
      })
      es.addEventListener('error', () => {
        setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: m.content || 'Sorry, something went wrong.', isStreaming: false } : m))
        setIsStreaming(false)
        es.close()
      })
    } catch {
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: 'Could not reach the AI Tutor. Is the companion service running?', isStreaming: false } : m))
      setIsStreaming(false)
    }
  }, [isStreaming, accessToken, user])

  const handleSend = () => { sendMessage(input.trim()); setInput('') }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-500/10 rounded-xl flex items-center justify-center">
            <Bot size={16} className="text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">AI Tutor</p>
            <p className="text-xs text-text-muted">Ask anything about your courses</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Bot size={22} className="text-brand-400" />
            </div>
            <p className="text-text-secondary text-sm font-medium">Your personal AI tutor</p>
            <p className="text-text-muted text-xs mt-1 max-w-xs">Ask questions about your courses, get explanations, or be quizzed on what you've learned.</p>
            <div className="mt-5 grid gap-2 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-left text-xs text-text-secondary bg-surface-border/40 hover:bg-surface-border px-3 py-2 rounded-lg transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'learner' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'learner'
                ? 'bg-brand-500 text-white rounded-br-sm'
                : 'bg-surface-card border border-surface-border text-text-primary rounded-bl-sm'
            }`}>
              {msg.role === 'learner' ? (
                <p>{msg.content}</p>
              ) : (
                <ReactMarkdown components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ children }) => <code className="bg-surface-border px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
                  ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 mb-2">{children}</ol>,
                }}>
                  {msg.isStreaming ? msg.content + '▋' : msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 py-4 border-t border-surface-border">
        <div className="flex items-end gap-3 bg-surface-input border border-surface-border rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask your AI tutor anything..."
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-sm resize-none focus:outline-none min-h-[24px] max-h-[140px] leading-relaxed"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="p-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg transition-colors mb-0.5 shrink-0"
          >
            {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
