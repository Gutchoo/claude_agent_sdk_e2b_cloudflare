/**
 * FileMentionSuggestion
 *
 * Dropdown component for selecting files when user types @.
 * Shows filtered list of uploaded files.
 */

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SessionFile } from '@/types/e2b'

export interface SuggestionItem {
  id: string
  label: string
}

interface FileMentionSuggestionProps {
  items: SuggestionItem[]
  command: (item: SuggestionItem) => void
}

export interface SuggestionRef {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

export const FileMentionSuggestion = forwardRef<SuggestionRef, FileMentionSuggestionProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0)
    }, [items])

    const selectItem = (index: number) => {
      const item = items[index]
      if (item) {
        command(item)
      }
    }

    const upHandler = () => {
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
    }

    const downHandler = () => {
      setSelectedIndex((prev) => (prev + 1) % items.length)
    }

    const enterHandler = () => {
      selectItem(selectedIndex)
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          upHandler()
          return true
        }
        if (event.key === 'ArrowDown') {
          downHandler()
          return true
        }
        if (event.key === 'Enter') {
          enterHandler()
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-2 text-sm text-muted-foreground">
          No files found
        </div>
      )
    }

    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
              index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <FileIcon />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    )
  }
)

FileMentionSuggestion.displayName = 'FileMentionSuggestion'

function FileIcon() {
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
      className="shrink-0 text-muted-foreground"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

// Helper to convert SessionFile to SuggestionItem
export function filesToSuggestionItems(files: SessionFile[]): SuggestionItem[] {
  return files.map((file) => ({
    id: file.id,
    label: file.filename,
  }))
}
