/**
 * SessionSidebar Component
 *
 * Displays session list and allows:
 * - Creating new sessions
 * - Selecting existing sessions
 * - Deleting sessions
 *
 * Uses E2B session format with `title` field (not `name`).
 */

import { Button } from '@/components/ui/button'
import type { E2BSession } from '@/types/e2b'

interface SessionSidebarProps {
  sessions: E2BSession[]
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onDeleteSession: (sessionId: string) => void
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: SessionSidebarProps) {
  return (
    <div className="w-[200px] h-full border-r border-border flex flex-col bg-card overflow-hidden">
      {/* New Chat Button */}
      <div className="p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onNewSession}
        >
          <PlusIcon />
          <span>New Chat</span>
        </Button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-2 py-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No sessions yet
            </p>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                    session.id === currentSessionId
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  }`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {session.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(session.updated_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSession(session.id)
                    }}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  // Backend stores UTC timestamps without 'Z' suffix, so add it if missing
  const normalizedDateStr = dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)
    ? dateStr
    : dateStr + 'Z'
  const date = new Date(normalizedDateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function TrashIcon() {
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
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}
