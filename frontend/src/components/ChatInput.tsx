/**
 * ChatInput Component
 *
 * TipTap-based editor with @ file mentions support.
 * - Type @ to show dropdown of uploaded files
 * - Select file to insert atomic mention chip
 * - Sends content with @[filename] markers + file IDs array
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createSuggestion, filesToSuggestionItems } from '@/components/editor'
import type { SessionFile } from '@/types/e2b'

type ModelOption = 'opus-4.5' | 'sonnet-4'

const MODEL_LABELS: Record<ModelOption, string> = {
  'opus-4.5': 'Opus 4.5',
  'sonnet-4': 'Sonnet 4',
}

interface ChatInputProps {
  isConnected: boolean
  isProcessing: boolean
  files: SessionFile[]
  onSendMessage: (content: string, fileIds?: string[], model?: string) => void
}

// Extract text content with @[filename] markers and collect file IDs
function extractContentAndMentions(editor: ReturnType<typeof useEditor>): {
  content: string
  fileIds: string[]
} {
  if (!editor) return { content: '', fileIds: [] }

  const fileIds: string[] = []
  let content = ''

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mention') {
      const { id, label } = node.attrs
      if (id && label) {
        content += `@[${label}]`
        fileIds.push(id)
      }
    } else if (node.isText) {
      content += node.text
    } else if (node.type.name === 'paragraph') {
      // Add newline between paragraphs (but not for first one)
      if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n'
      }
    }
  })

  return { content: content.trim(), fileIds }
}

export function ChatInput({
  isConnected,
  isProcessing,
  files,
  onSendMessage,
}: ChatInputProps) {
  // Model selection state (visual only)
  const [selectedModel, setSelectedModel] = useState<ModelOption>('opus-4.5')

  // Track if suggestion popup is open, with timestamp of last close
  const suggestionOpenRef = useRef(false)
  const suggestionClosedAtRef = useRef(0)

  // Convert files to suggestion items
  const suggestionItems = useMemo(
    () => filesToSuggestionItems(files),
    [files]
  )

  // Create suggestion config with current files
  const suggestionConfig = useMemo(
    () => createSuggestion({
      files: suggestionItems,
      onOpenChange: (isOpen) => {
        suggestionOpenRef.current = isOpen
        if (!isOpen) {
          // Record when popup closed so we can ignore Enter presses right after
          suggestionClosedAtRef.current = Date.now()
        }
      },
    }),
    [suggestionItems]
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't need
        heading: false,
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: 'Type a message... Use @ to mention files',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: suggestionConfig,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'outline-none text-sm min-h-[60px] max-h-[200px] overflow-y-auto',
      },
    },
    editable: isConnected,
  }, [suggestionConfig]) // Re-create editor when suggestion config changes

  // Update editable state when connection changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(isConnected)
    }
  }, [editor, isConnected])

  // Update suggestion items when files change
  useEffect(() => {
    if (editor) {
      const mentionExtension = editor.extensionManager.extensions.find(
        (ext) => ext.name === 'mention'
      )
      if (mentionExtension) {
        // Update the items function with new files
        mentionExtension.options.suggestion.items = ({ query }: { query: string }) => {
          const lowerQuery = query.toLowerCase()
          return suggestionItems.filter((item) =>
            item.label.toLowerCase().includes(lowerQuery)
          )
        }
      }
    }
  }, [editor, suggestionItems])

  const handleSubmit = useCallback(() => {
    if (!editor || !isConnected || isProcessing) return

    const { content, fileIds } = extractContentAndMentions(editor)
    if (!content) return

    onSendMessage(content, fileIds.length > 0 ? fileIds : undefined, selectedModel)

    // Clear editor
    editor.commands.clearContent()
  }, [editor, isConnected, isProcessing, onSendMessage, selectedModel])

  // Handle Enter key to submit - but not when suggestion popup is open
  useEffect(() => {
    if (!editor) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        // Check if suggestion popup is active
        const popup = document.querySelector('[data-tippy-root]')
        if (popup || suggestionOpenRef.current) {
          // Popup is open - don't send
          return
        }

        // Check if popup just closed (within last 100ms) - means Enter was used to select
        const timeSinceClose = Date.now() - suggestionClosedAtRef.current
        if (timeSinceClose < 100) {
          // Popup just closed from Enter selection - don't send
          return
        }

        event.preventDefault()
        handleSubmit()
      }
    }

    const element = editor.view.dom
    element.addEventListener('keydown', handleKeyDown)

    return () => {
      element.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor, handleSubmit])

  const canSend = editor && !editor.isEmpty && isConnected && !isProcessing

  return (
    <div className="bg-muted/50 rounded-xl border border-border">
      {/* Editor section */}
      <div className="p-3 pb-0">
        <EditorContent
          editor={editor}
          className="[&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.mention]:inline-flex [&_.mention]:items-center [&_.mention]:gap-1 [&_.mention]:px-1.5 [&_.mention]:py-0.5 [&_.mention]:mx-0.5 [&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:text-primary [&_.mention]:text-sm [&_.mention]:font-medium"
        />
      </div>

      {/* Bottom bar with model picker and send button */}
      <div className="flex items-center justify-end px-3 py-2 gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 px-2 gap-1 text-muted-foreground hover:text-foreground">
              <span className="text-sm">{MODEL_LABELS[selectedModel]}</span>
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSelectedModel('opus-4.5')}>
              Opus 4.5
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedModel('sonnet-4')}>
              Sonnet 4
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon"
          onClick={isProcessing ? undefined : handleSubmit}
          disabled={!canSend && !isProcessing}
          className="h-8 w-8 rounded-lg shrink-0"
        >
          {isProcessing ? <StopIcon /> : <SendIcon />}
        </Button>
      </div>
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
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function ChevronDownIcon() {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
