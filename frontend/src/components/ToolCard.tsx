/**
 * ToolCard Component
 *
 * Displays tool use and result in a collapsible card.
 * Shows tool name, input preview, and full details when expanded.
 */

import { useState } from 'react'
import type { ToolUse } from '@/types/e2b'

interface ToolCardProps {
  toolUse: ToolUse
}

export function ToolCard({ toolUse }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const formatToolName = (name: string) => {
    // Remove prefixes like "mcp__tools__"
    const cleaned = name.replace(/^mcp__\w+__/, '')
    // Convert snake_case to Title Case
    return cleaned
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const formatToolInput = (input: Record<string, unknown>) => {
    const entries = Object.entries(input)
    if (entries.length === 0) return ''

    const preview = entries.slice(0, 2).map(([key, value]) => {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
      const truncated = valueStr.length > 30 ? valueStr.slice(0, 30) + '...' : valueStr
      return `${key}: ${truncated}`
    })

    return preview.join(', ')
  }

  const hasResult = toolUse.result !== undefined
  const isRunning = !hasResult

  return (
    <div className="rounded-md border border-border bg-muted/30 text-sm">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        {isRunning ? <LoadingDot /> : <SuccessDot isError={toolUse.isError} />}
        <span className="font-medium text-foreground">{formatToolName(toolUse.toolName)}</span>
        <span className="text-muted-foreground text-xs truncate flex-1">
          {formatToolInput(toolUse.input)}
        </span>
        {toolUse.duration !== undefined && (
          <span className="text-xs text-muted-foreground">
            {(toolUse.duration / 1000).toFixed(1)}s
          </span>
        )}
        <ChevronIcon expanded={isExpanded} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-2 space-y-2 border-t border-border/50">
          {/* Input */}
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-1">Input:</p>
            <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(toolUse.input, null, 2)}
            </pre>
          </div>

          {/* Result (if available) */}
          {hasResult && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {toolUse.isError ? 'Error:' : 'Result:'}
              </p>
              <pre
                className={`text-xs p-2 rounded overflow-x-auto whitespace-pre-wrap ${
                  toolUse.isError ? 'bg-red-500/10 text-red-400' : 'bg-background/50'
                }`}
              >
                {toolUse.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LoadingDot() {
  return <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
}

function SuccessDot({ isError }: { isError?: boolean }) {
  return (
    <span className={`w-2 h-2 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`} />
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
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
      className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
