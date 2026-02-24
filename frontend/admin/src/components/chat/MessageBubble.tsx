import { CheckCircle, XCircle, Loader2, Clock, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage, ToolCall, ToolCallStatus } from '@lms-types/index'
import { formatDistanceToNow } from 'date-fns'

const statusConfig: Record<ToolCallStatus, { icon: React.ElementType; color: string; label: string }> = {
  pending:  { icon: Clock,       color: 'text-text-muted',      label: 'Waiting...'   },
  running:  { icon: Loader2,     color: 'text-brand-400',       label: 'Running...'   },
  success:  { icon: CheckCircle, color: 'text-status-success',  label: 'Done'         },
  done:     { icon: CheckCircle, color: 'text-status-success',  label: 'Done'         },
  skipped:  { icon: AlertCircle, color: 'text-status-warning',  label: 'Skipped'      },
  failed:   { icon: XCircle,     color: 'text-status-error',    label: 'Failed'       },
}

const fallbackStatus = { icon: Clock, color: 'text-text-muted', label: 'Working...' }

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const { icon: Icon, color, label } = statusConfig[toolCall.status] ?? fallbackStatus
  return (
    <div className="tool-call-card">
      <Icon
        size={15}
        className={`${color} shrink-0 ${toolCall.status === 'running' ? 'animate-spin' : ''}`}
      />
      <span className="text-text-secondary font-medium">{toolCall.displayName}</span>
      <span className={`ml-auto text-xs ${color}`}>{label}</span>
      {toolCall.error && (
        <span className="text-xs text-status-error ml-1">— {toolCall.error}</span>
      )}
    </div>
  )
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isAdmin = message.role === 'admin'
  const timeAgo = formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })

  return (
    <div className={`flex flex-col gap-2 animate-fade-in ${isAdmin ? 'items-end' : 'items-start'}`}>
      {/* Bubble */}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isAdmin
            ? 'bg-brand-500 text-white rounded-br-sm'
            : 'bg-surface-card border border-surface-border text-text-primary rounded-bl-sm'
        }`}
      >
        {isAdmin ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              code: ({ children }) => (
                <code className="bg-surface-border px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="bg-surface border border-surface-border rounded-xl p-3 overflow-x-auto text-xs font-mono mt-2">
                  {children}
                </pre>
              ),
              ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 mb-2">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 mb-2">{children}</ol>,
            }}
          >
            {message.isStreaming ? message.content + '▋' : message.content}
          </ReactMarkdown>
        )}
      </div>

      {/* Tool Calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="w-full max-w-[85%] space-y-1.5">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Timestamp */}
      <span className="text-xs text-text-muted px-1">{timeAgo}</span>
    </div>
  )
}
