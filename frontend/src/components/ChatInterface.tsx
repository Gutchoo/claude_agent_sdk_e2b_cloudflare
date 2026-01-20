/**
 * ChatInterface Component
 *
 * Main chat area with:
 * - Message list (scrollable)
 * - Chat input with TipTap editor and @ file mentions
 */

import { useRef, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatInput } from '@/components/ChatInput'
import { MessageBubble } from '@/components/MessageBubble'
import type { DisplayMessage, SessionFile } from '@/types/e2b'

// Format elapsed time for display
function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

// Standalone timer shown while waiting for response
function WaitingTimer({ elapsedTime }: { elapsedTime: number }) {
  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="font-mono">{formatElapsedTime(elapsedTime)}</span>
        </div>
      </div>
    </div>
  )
}

interface ChatInterfaceProps {
  messages: DisplayMessage[]
  isConnected: boolean
  isProcessing: boolean
  isWaitingForResponse: boolean
  elapsedTime: number
  files: SessionFile[]
  onSendMessage: (content: string, fileIds?: string[], model?: string) => void
}

export function ChatInterface({
  messages,
  isConnected,
  isProcessing,
  isWaitingForResponse,
  elapsedTime,
  files,
  onSendMessage,
}: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change or waiting/processing starts
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isProcessing, isWaitingForResponse])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4 min-h-0">
        <div className="space-y-6 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-base">
                Start a conversation with Claude.
              </p>
            </div>
          )}
          {messages.map((message, index) => {
            const isLastMessage = index === messages.length - 1
            const isLastAssistant = isLastMessage && message.role === 'assistant'
            const showTimer = isLastAssistant && elapsedTime > 0

            return (
              <MessageBubble
                key={message.id}
                message={message}
                elapsedTime={showTimer ? elapsedTime : undefined}
                isTimerActive={showTimer && isProcessing}
              />
            )
          })}
          {/* Show waiting timer immediately after user sends message */}
          {isWaitingForResponse && (
            <WaitingTimer elapsedTime={elapsedTime} />
          )}
          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            isConnected={isConnected}
            isProcessing={isProcessing}
            files={files}
            onSendMessage={onSendMessage}
          />
        </div>
      </div>
    </div>
  )
}
