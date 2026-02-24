import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useChat } from '@hooks/useChat'
import ChatPanel from '@components/chat/ChatPanel'
import ChatHistory from '@components/chat/ChatHistory'

export default function ChatPage() {
  const {
    messages, sendMessage, isStreaming,
    sessions, activeChatId, newChat, loadSession, deleteSession,
  } = useChat()

  const [searchParams, setSearchParams] = useSearchParams()
  const autoSentRef = useRef(false)

  // Auto-send edit context when navigated from "Edit in Chat" with courseId
  useEffect(() => {
    if (autoSentRef.current || isStreaming) return
    const courseId = searchParams.get('courseId')
    const courseName = searchParams.get('courseName')
    if (courseId && courseName) {
      autoSentRef.current = true
      // Clear the URL params so it doesn't re-trigger
      setSearchParams({})
      // Start a new chat with the edit context
      newChat()
      // Small delay to ensure the new chat is created
      setTimeout(() => {
        sendMessage(`I want to edit the course "${courseName}" (ID: ${courseId})`)
      }, 200)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full">
      <ChatHistory
        sessions={sessions}
        activeChatId={activeChatId}
        isStreaming={isStreaming}
        onNewChat={newChat}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
      />
      <ChatPanel
        messages={messages}
        sendMessage={sendMessage}
        isStreaming={isStreaming}
        onNewChat={newChat}
      />
    </div>
  )
}
