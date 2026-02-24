import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, MessageSquare, Pencil, Check, X } from 'lucide-react'
import type { ChatSession } from '@hooks/useChat'
import api from '@services/api'

interface Props {
  sessions: ChatSession[]
  activeChatId: string | null
  isStreaming: boolean
  onNewChat: () => void
  onLoadSession: (id: string) => void
  onDeleteSession: (id: string) => void
}

function timeGroup(createdAt: string): string {
  const date = new Date(createdAt)
  const now  = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff <= 7)  return 'Previous 7 days'
  if (diff <= 30) return 'Previous 30 days'
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

interface Group { label: string; items: ChatSession[] }

function groupSessions(sessions: ChatSession[]): Group[] {
  const groups: Group[] = []
  for (const s of sessions) {
    const label = timeGroup(s.createdAt)
    const g = groups.find((g) => g.label === label)
    if (g) g.items.push(s)
    else groups.push({ label, items: [s] })
  }
  return groups
}

export default function ChatHistory({
  sessions, activeChatId, isStreaming, onNewChat, onLoadSession, onDeleteSession,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editTitle, setEditTitle]         = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const groups = groupSessions(sessions)

  // Focus input when editing starts
  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  const startRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(session.id)
    setEditTitle(session.title)
  }

  const saveRename = async () => {
    if (!editingId || !editTitle.trim()) { setEditingId(null); return }
    try {
      await api.patch(`/chats/${editingId}`, { title: editTitle.trim() })
      // Update local session title
      const session = sessions.find((s) => s.id === editingId)
      if (session) session.title = editTitle.trim()
    } catch { /* ignore */ }
    setEditingId(null)
  }

  const cancelRename = () => { setEditingId(null) }

  return (
    <aside className="w-56 shrink-0 border-r border-surface-border flex flex-col h-full">
      {/* New Chat button */}
      <div className="px-3 py-3 border-b border-surface-border shrink-0">
        <button
          onClick={onNewChat}
          disabled={isStreaming}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-text-primary hover:bg-surface-border/60 transition-colors disabled:opacity-40"
        >
          <Plus size={15} className="text-brand-400 shrink-0" />
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-text-muted">
            No conversations yet.<br />Start chatting!
          </div>
        ) : (
          groups.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider select-none">
                {label}
              </p>
              {items.map((session) => {
                const isActive   = session.id === activeChatId
                const isDeleting = session.id === pendingDelete
                const isEditing  = session.id === editingId

                return (
                  <div
                    key={session.id}
                    className={`group relative flex items-center gap-2 mx-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors select-none ${
                      isActive
                        ? 'bg-brand-500/10 text-text-primary'
                        : 'text-text-secondary hover:bg-surface-border/50 hover:text-text-primary'
                    }`}
                    onClick={() => !isDeleting && !isEditing && onLoadSession(session.id)}
                  >
                    <MessageSquare
                      size={13}
                      className={`shrink-0 ${isActive ? 'text-brand-400' : 'text-text-muted'}`}
                    />

                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={editInputRef}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') cancelRename() }}
                          className="flex-1 text-xs bg-surface-secondary border border-surface-border rounded px-1.5 py-0.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 min-w-0"
                        />
                        <button onClick={saveRename} className="text-green-400 hover:text-green-300"><Check size={11} /></button>
                        <button onClick={cancelRename} className="text-text-muted hover:text-text-primary"><X size={11} /></button>
                      </div>
                    ) : (
                      <span className="text-xs truncate flex-1 leading-snug pr-4">
                        {session.title}
                      </span>
                    )}

                    {/* Action buttons — visible on hover, hidden when editing */}
                    {!isEditing && (
                      <div className="absolute right-2 hidden group-hover:flex items-center gap-0.5">
                        <button
                          onClick={(e) => startRename(session, e)}
                          className="p-0.5 rounded text-text-muted hover:text-brand-400 transition-colors"
                          title="Rename"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPendingDelete(session.id)
                            onDeleteSession(session.id)
                            setPendingDelete(null)
                          }}
                          className="p-0.5 rounded text-text-muted hover:text-status-error transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
