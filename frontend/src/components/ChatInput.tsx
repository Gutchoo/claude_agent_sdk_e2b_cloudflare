/**
 * ChatInput Component
 *
 * Simple textarea-based input.
 * No TipTap, no file mentions, just plain text.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface ChatInputProps {
  isConnected: boolean
  isProcessing: boolean
  onSendMessage: (content: string) => void
}

export function ChatInput({ isConnected, isProcessing, onSendMessage }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || !isConnected || isProcessing) return

    onSendMessage(trimmed)
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, isConnected, isProcessing, onSendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const canSend = input.trim() && isConnected && !isProcessing

  return (
    <div className="flex gap-2 items-end border border-border rounded-lg bg-card p-2">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? 'Type a message...' : 'Connecting...'}
        disabled={!isConnected}
        className="flex-1 resize-none bg-transparent border-0 outline-none text-sm min-h-[40px] max-h-[200px] py-2 px-1 placeholder:text-muted-foreground disabled:opacity-50"
        rows={1}
      />
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={!canSend}
        className="shrink-0"
      >
        {isProcessing ? (
          <LoadingSpinner />
        ) : (
          <SendIcon />
        )}
      </Button>
    </div>
  )
}

function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
