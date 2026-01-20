/**
 * MessageBubble Component
 *
 * Displays a single message (user or assistant).
 * Parses @[filename] mentions and renders as styled chips.
 * Tool uses displayed inline via ToolCard.
 */

import { ToolCard } from '@/components/ToolCard'
import type { DisplayMessage } from '@/types/e2b'
import type { ReactNode } from 'react'

interface MessageBubbleProps {
  message: DisplayMessage
  elapsedTime?: number
  isTimerActive?: boolean
}

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

// Timer component displayed under assistant responses
function ResponseTimer({ elapsedTime, isActive }: { elapsedTime: number; isActive?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
      <span className="font-mono">{formatElapsedTime(elapsedTime)}</span>
    </div>
  )
}

// Parse @[filename] mentions and render as styled chips
function parseFileMentions(content: string): ReactNode[] {
  const mentionRegex = /@\[([^\]]+)\]/g
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(content)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    // Add the mention chip
    const filename = match[1]
    parts.push(
      <FileMentionChip key={`${match.index}-${filename}`} filename={filename} />
    )

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts
}

// File mention chip for display in messages
function FileMentionChip({ filename }: { filename: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-primary-foreground/20 text-primary-foreground text-sm font-medium whitespace-nowrap">
      <FileIcon />
      @{filename}
    </span>
  )
}

function FileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

export function MessageBubble({ message, elapsedTime, isTimerActive }: MessageBubbleProps) {
  if (message.role === 'user') {
    // Check if content contains file mentions
    const hasMentions = /@\[[^\]]+\]/.test(message.content)

    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[85%] rounded-xl px-4 py-3 bg-primary text-primary-foreground">
          <p className="text-base whitespace-pre-wrap leading-relaxed">
            {hasMentions ? parseFileMentions(message.content) : message.content}
          </p>
        </div>
      </div>
    )
  }

  // Assistant message
  const hasToolUses = message.toolUses && message.toolUses.length > 0
  const hasContent = message.content.trim().length > 0
  const showTimer = elapsedTime !== undefined && elapsedTime > 0

  // If no content and no tool uses yet, just show the timer (if available)
  if (!hasContent && !hasToolUses) {
    if (showTimer) {
      return (
        <div className="flex gap-4">
          <div className="flex-1">
            <ResponseTimer elapsedTime={elapsedTime} isActive={isTimerActive} />
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-3">
        {/* Tool uses (if any) */}
        {hasToolUses && (
          <div className="space-y-2">
            {message.toolUses!.map((toolUse) => (
              <ToolCard key={toolUse.id} toolUse={toolUse} />
            ))}
          </div>
        )}

        {/* Text content */}
        {hasContent && (
          <div>
            <p className="text-base whitespace-pre-wrap leading-relaxed text-foreground">
              {message.content}
            </p>
          </div>
        )}

        {/* Response timer */}
        {showTimer && (
          <ResponseTimer elapsedTime={elapsedTime} isActive={isTimerActive} />
        )}
      </div>
    </div>
  )
}
