import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Paperclip, Link, Youtube, Rss, RotateCcw } from 'lucide-react'
import MessageBubble from './MessageBubble'
import FileUpload from './FileUpload'
import type { ChatMessage } from '@lms-types/index'

const YT_REGEX  = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w\-]+/g
const RSS_REGEX = /https?:\/\/\S+(?:\/rss|\/feed|\.rss|\.xml)\S*/g

interface ChatPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (content: string) => void
  onNewChat?: () => void
}

export default function ChatPanel({ messages, sendMessage, isStreaming, onNewChat }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const detectedYtUrls = useMemo(() => input.match(YT_REGEX) ?? [], [input])
  const detectedRssUrls = useMemo(() => input.match(RSS_REGEX) ?? [], [input])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  const handleSend = () => {
    if (!input.trim() || isStreaming) return
    sendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFilesUploaded = (text: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${text}` : text))
    setShowUpload(false)
  }

  return (
    <div className="flex flex-col flex-1 h-full border-r border-surface-border">
      <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Chat Studio</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Type a command or upload content — your AI will handle the rest
          </p>
        </div>
        {messages.length > 0 && onNewChat && (
          <button
            onClick={onNewChat}
            disabled={isStreaming}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-40 transition-colors px-2 py-1 rounded-lg hover:bg-surface-border"
            title="Start a new chat"
          >
            <RotateCcw size={12} />
            New Chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Send size={20} className="text-brand-400" />
            </div>
            <p className="text-text-secondary text-sm font-medium">Start a conversation</p>
            <p className="text-text-muted text-xs mt-1 max-w-xs">
              Try: "Create a Python beginner course from this PDF" or paste a YouTube link
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
              {[
                'Create a JavaScript course for beginners',
                'Enroll all Sales team members in the new course',
                'Show me the analytics for this month',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-left text-xs text-text-secondary bg-surface-border/40 hover:bg-surface-border px-3 py-2 rounded-lg transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {showUpload && (
        <FileUpload
          onClose={() => setShowUpload(false)}
          onFilesUploaded={handleFilesUploaded}
        />
      )}

      {(detectedYtUrls.length > 0 || detectedRssUrls.length > 0) && (
        <div className="px-5 pb-2">
          {detectedYtUrls.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-brand-400 bg-brand-500/5 border border-brand-500/20 rounded-lg px-3 py-2">
              <Youtube size={12} />
              {detectedYtUrls.length} YouTube video{detectedYtUrls.length > 1 ? 's' : ''} detected — I'll extract real titles and durations automatically
            </div>
          )}
          {detectedRssUrls.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-brand-400 bg-brand-500/5 border border-brand-500/20 rounded-lg px-3 py-2 mt-1">
              <Rss size={12} />
              Podcast RSS feed detected — I'll fetch all episodes automatically
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-4 border-t border-surface-border">
        <div className="flex items-end gap-3 bg-surface-input border border-surface-border rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition-all">
          <div className="flex gap-1 mb-1">
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="p-1 text-text-muted hover:text-brand-400 transition-colors"
              title="Upload file"
            >
              <Paperclip size={16} />
            </button>
            <button
              className="p-1 text-text-muted hover:text-brand-400 transition-colors"
              title="Paste URL"
            >
              <Link size={16} />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or paste a YouTube / Google Meet / Zoom link..."
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-sm resize-none focus:outline-none min-h-[24px] max-h-40 leading-relaxed"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="p-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors mb-0.5 shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
