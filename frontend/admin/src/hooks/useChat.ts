import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage, ToolCall } from '@lms-types/index'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

const COURSE_ID_RE = /\(ID:\s*([a-f0-9-]{36})\)/i
const ACTIVE_KEY   = (uid: string) => `lms_chat_active_${uid}`

export interface ChatSession {
  id: string              // DB UUID
  sessionId: string       // backend Redis session ID
  title: string
  createdAt: string
  messages: ChatMessage[]
  previewCourseId: string | null
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'admin')
  if (!first?.content) return 'New conversation'
  let text = first.content.trim()
  // Clean up YouTube URLs from title — use "YouTube Course" instead
  if (text.match(/https?:\/\/(www\.)?youtube\.com|youtu\.be/)) {
    text = text.replace(/https?:\/\/\S+/g, '').trim()
    if (!text) return 'YouTube Course'
  }
  // Clean up any remaining long URLs
  text = text.replace(/https?:\/\/\S+/g, '[link]').trim()
  return text.length > 50 ? text.slice(0, 50) + '…' : text || 'New conversation'
}

export function useChat() {
  const { accessToken, user } = useAuthStore()
  const userId = user?.id ?? 'anon'
  const orgId  = user?.orgId ?? 'dev'

  const [sessions, setSessions]             = useState<ChatSession[]>([])
  const [activeChatId, setActiveChatId]     = useState<string | null>(null)
  const [isStreaming, setIsStreaming]        = useState(false)
  const [messages, setMessages]             = useState<ChatMessage[]>([])
  const [previewCourseId, setPreviewCourseId] = useState<string | null>(null)
  const [loaded, setLoaded]                 = useState(false)

  const eventSourceRef  = useRef<EventSource | null>(null)
  const sessionIdRef    = useRef<string | null>(null)
  const activeChatIdRef = useRef<string | null>(null)
  activeChatIdRef.current = activeChatId

  // ── Load sessions from DB on mount ──────────────────────────────────────
  useEffect(() => {
    if (!userId || userId === 'anon') return
    api.get(`/chats?userId=${userId}&orgId=${orgId}`)
      .then(async (res) => {
        const dbSessions = (res.data.data ?? []) as Array<{
          id: string; redis_session_id: string; title: string
          created_at: string; message_count: number
        }>

        // Convert DB format to ChatSession (messages loaded on-demand)
        const converted: ChatSession[] = dbSessions.map((s) => ({
          id:             s.id,
          sessionId:      s.redis_session_id ?? '',
          title:          s.title,
          createdAt:      s.created_at,
          messages:       [], // loaded when session is opened
          previewCourseId: null,
        }))

        setSessions(converted)

        // Restore active session
        const savedActiveId = localStorage.getItem(ACTIVE_KEY(userId))
        const activeSession = converted.find((s) => s.id === savedActiveId) ?? converted[0] ?? null
        if (activeSession) {
          // Load full messages for the active session
          try {
            const detail = await api.get(`/chats/${activeSession.id}`)
            const fullMessages = detail.data.data?.messages ?? []
            activeSession.messages = fullMessages
            setActiveChatId(activeSession.id)
            setMessages(fullMessages)
            sessionIdRef.current = activeSession.sessionId || null
          } catch {
            setActiveChatId(activeSession.id)
          }
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [userId, orgId])

  // ── Persist active session ID ───────────────────────────────────────────
  useEffect(() => {
    if (activeChatId) localStorage.setItem(ACTIVE_KEY(userId), activeChatId)
  }, [activeChatId, userId])

  // ── Save messages to DB when they change (debounced) ────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!loaded || !activeChatIdRef.current || messages.length === 0) return
    // Don't save while streaming (wait for completion)
    if (messages.some((m) => m.isStreaming)) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const chatId = activeChatIdRef.current
      if (!chatId) return
      const title = deriveTitle(messages)
      api.patch(`/chats/${chatId}`, {
        title,
        messages: messages.map((m) => ({ ...m, isStreaming: false })),
        redisSessionId: sessionIdRef.current ?? undefined,
      }).catch(() => {}) // silent fail
    }, 1000)
  }, [messages, loaded])

  // ── Session management ──────────────────────────────────────────────────
  const newChat = useCallback(async () => {
    if (isStreaming) return
    eventSourceRef.current?.close()

    try {
      const res = await api.post('/chats', { userId, orgId, title: 'New conversation', messages: [] })
      const newSession: ChatSession = {
        id:             res.data.data.id,
        sessionId:      '',
        title:          'New conversation',
        createdAt:      new Date().toISOString(),
        messages:       [],
        previewCourseId: null,
      }
      setSessions((prev) => [newSession, ...prev])
      setActiveChatId(newSession.id)
      setMessages([])
      setPreviewCourseId(null)
      setIsStreaming(false)
      sessionIdRef.current = null
    } catch {
      // Fallback to local-only if DB fails
      const chatId = crypto.randomUUID()
      const session: ChatSession = {
        id: chatId, sessionId: '', title: 'New conversation',
        createdAt: new Date().toISOString(), messages: [], previewCourseId: null,
      }
      setSessions((prev) => [session, ...prev])
      setActiveChatId(chatId)
      setMessages([])
      setPreviewCourseId(null)
      setIsStreaming(false)
      sessionIdRef.current = null
    }
  }, [isStreaming, userId, orgId])

  const loadSession = useCallback(async (chatId: string) => {
    if (isStreaming) return
    const target = sessions.find((s) => s.id === chatId)
    if (!target || target.id === activeChatId) return
    eventSourceRef.current?.close()

    // Load full messages from DB
    try {
      const res = await api.get(`/chats/${chatId}`)
      const fullMessages = res.data.data?.messages ?? []
      setActiveChatId(chatId)
      setMessages(fullMessages)
      setPreviewCourseId(null)
      setIsStreaming(false)
      sessionIdRef.current = res.data.data?.redis_session_id || null
    } catch {
      setActiveChatId(chatId)
      setMessages(target.messages)
      setPreviewCourseId(target.previewCourseId)
      sessionIdRef.current = target.sessionId || null
    }
  }, [sessions, activeChatId, isStreaming])

  const deleteSession = useCallback(async (chatId: string) => {
    // Delete from DB
    api.delete(`/chats/${chatId}`).catch(() => {})

    const nextSessions = sessions.filter((s) => s.id !== chatId)
    setSessions(nextSessions)
    if (activeChatId === chatId) {
      const fallback = nextSessions[0] ?? null
      setActiveChatId(fallback?.id ?? null)
      setMessages(fallback?.messages ?? [])
      setPreviewCourseId(fallback?.previewCourseId ?? null)
      sessionIdRef.current = fallback?.sessionId ?? null
    }
  }, [sessions, activeChatId])

  // ── Send a new message ──────────────────────────────────────────────────
  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming) return

    // Auto-create a session if none exists
    let chatId: string = activeChatIdRef.current ?? ''
    if (!chatId) {
      try {
        const res = await api.post('/chats', { userId, orgId, title: content.slice(0, 50), messages: [] })
        chatId = res.data.data.id
        const newSession: ChatSession = {
          id: chatId, sessionId: '', title: content.slice(0, 50),
          createdAt: new Date().toISOString(), messages: [], previewCourseId: null,
        }
        setSessions((prev) => [newSession, ...prev])
        setActiveChatId(chatId)
        activeChatIdRef.current = chatId
      } catch {
        chatId = crypto.randomUUID()
        activeChatIdRef.current = chatId
      }
    }

    const adminMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'admin', content,
      timestamp: new Date().toISOString(),
    }
    const aiMsgId = crypto.randomUUID()
    const aiMsg: ChatMessage = {
      id: aiMsgId, role: 'assistant', content: '', toolCalls: [],
      timestamp: new Date().toISOString(), isStreaming: true,
    }

    setMessages((prev) => [...prev, adminMsg, aiMsg])
    setIsStreaming(true)

    try {
      const res = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          message: content,
          user_id: user?.id ?? 'admin',
          org_id:  user?.orgId ?? 'dev',
          ...(sessionIdRef.current && { session_id: sessionIdRef.current }),
        }),
      })
      if (!res.ok) throw new Error('Failed to start chat session')

      const body = await res.json()
      const sessionId: string = body.session_id ?? body.sessionId
      if (!sessionId) throw new Error('No session ID returned')
      sessionIdRef.current = sessionId

      const es = new EventSource(`/api/admin/chat/${sessionId}/stream`)
      eventSourceRef.current = es

      es.addEventListener('token', (e) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + (e as MessageEvent).data } : m)),
        )
      })
      es.addEventListener('tool_call', (e) => {
        const toolCall: ToolCall = JSON.parse((e as MessageEvent).data)
        if (toolCall.name === 'create_course' && toolCall.status === 'success' && typeof toolCall.result === 'string') {
          const match = COURSE_ID_RE.exec(toolCall.result)
          if (match) setPreviewCourseId(match[1])
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, toolCalls: [...(m.toolCalls ?? []).filter((t) => t.id !== toolCall.id), toolCall] }
              : m,
          ),
        )
      })
      es.addEventListener('done', () => {
        setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m)))
        setIsStreaming(false)
        es.close()
      })
      es.addEventListener('error', (event) => {
        const detail = (event as MessageEvent).data
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: m.content || (detail ? `Error: ${detail}` : 'Something went wrong.'), isStreaming: false }
              : m,
          ),
        )
        setIsStreaming(false)
        es.close()
      })
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: 'Failed to connect to the AI. Is the Agent Orchestrator running?', isStreaming: false }
            : m,
        ),
      )
      setIsStreaming(false)
    }
  }, [isStreaming, accessToken, user, userId, orgId])

  return {
    messages,
    sendMessage,
    isStreaming,
    previewCourseId,
    sessions,
    activeChatId,
    newChat,
    loadSession,
    deleteSession,
    clearHistory: newChat,
  }
}
