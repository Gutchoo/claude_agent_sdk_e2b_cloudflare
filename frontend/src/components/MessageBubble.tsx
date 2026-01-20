/**
 * MessageBubble Component
 *
 * Displays a single message (user or assistant).
 * No streaming animation - shows full content immediately.
 * Tool uses displayed inline via ToolCard.
 */

import { ToolCard } from '@/components/ToolCard'
import type { DisplayMessage } from '@/types/e2b'

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

export function MessageBubble({ message, elapsedTime, isTimerActive }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[85%] rounded-xl px-4 py-3 bg-primary text-primary-foreground">
          <p className="text-base whitespace-pre-wrap leading-relaxed">
            {message.content}
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
