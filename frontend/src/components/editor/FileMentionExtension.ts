/**
 * FileMention TipTap Extension
 *
 * Custom node for rendering @file mentions as atomic chips.
 * Users type @ to trigger the suggestion dropdown.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { FileMentionComponent } from './FileMentionComponent'

export interface FileMentionOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileMention: {
      setFileMention: (attributes: { id: string; label: string }) => ReturnType
    }
  }
}

export const FileMentionExtension = Node.create<FileMentionOptions>({
  name: 'fileMention',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-id'),
        renderHTML: (attributes) => ({
          'data-id': attributes.id,
        }),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => ({
          'data-label': attributes.label,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: `span[data-type="${this.name}"]`,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-type': this.name },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      `@${HTMLAttributes['data-label']}`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileMentionComponent)
  },

  addCommands() {
    return {
      setFileMention:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
