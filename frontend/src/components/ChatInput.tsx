/**
 * ChatInput Component
 *
 * TipTap-based editor with @ file mentions support.
 * - Type @ to show dropdown of uploaded files
 * - Select file to insert atomic mention chip
 * - Sends content with @[filename] markers + file IDs array
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { Button } from '@/components/ui/button'
import { createSuggestion, filesToSuggestionItems } from '@/components/editor'
import type { SessionFile } from '@/types/e2b'

interface ChatInputProps {
  isConnected: boolean
  isProcessing: boolean
  files: SessionFile[]
  onSendMessage: (content: string, fileIds?: string[]) => void
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
        class: 'flex-1 outline-none text-sm min-h-[40px] max-h-[200px] overflow-y-auto py-2 px-1',
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

    onSendMessage(content, fileIds.length > 0 ? fileIds : undefined)

    // Clear editor
    editor.commands.clearContent()
  }, [editor, isConnected, isProcessing, onSendMessage])

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
    <div className="flex gap-2 items-end border border-border rounded-lg bg-card p-2">
      <EditorContent
        editor={editor}
        className="flex-1 [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.mention]:inline-flex [&_.mention]:items-center [&_.mention]:gap-1 [&_.mention]:px-1.5 [&_.mention]:py-0.5 [&_.mention]:mx-0.5 [&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:text-primary [&_.mention]:text-sm [&_.mention]:font-medium"
      />
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={!canSend}
        className="shrink-0"
      >
        {isProcessing ? <LoadingSpinner /> : <SendIcon />}
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
