/**
 * TipTap Suggestion Configuration
 *
 * Configures the @ trigger for file mentions with tippy.js positioning.
 */

import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance } from 'tippy.js'
import {
  FileMentionSuggestion,
  type SuggestionItem,
  type SuggestionRef,
} from './FileMentionSuggestion'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'

export interface CreateSuggestionOptions {
  files: SuggestionItem[]
  onOpenChange?: (isOpen: boolean) => void
}

export function createSuggestion({
  files,
  onOpenChange,
}: CreateSuggestionOptions): Omit<SuggestionOptions<SuggestionItem>, 'editor'> {
  return {
    char: '@',
    allowSpaces: false,
    startOfLine: false,

    items: ({ query }) => {
      const lowerQuery = query.toLowerCase()
      return files.filter((item) =>
        item.label.toLowerCase().includes(lowerQuery)
      )
    },

    render: () => {
      let component: ReactRenderer<SuggestionRef> | null = null
      let popup: Instance[] | null = null

      return {
        onStart: (props: SuggestionProps<SuggestionItem>) => {
          onOpenChange?.(true)

          component = new ReactRenderer(FileMentionSuggestion, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect) return

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            offset: [0, 4],
          })
        },

        onUpdate: (props: SuggestionProps<SuggestionItem>) => {
          component?.updateProps(props)

          if (!props.clientRect) return

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          })
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide()
            return true
          }

          return component?.ref?.onKeyDown(props) ?? false
        },

        onExit: () => {
          onOpenChange?.(false)
          popup?.[0]?.destroy()
          component?.destroy()
        },
      }
    },
  }
}
