/**
 * FileMentionComponent
 *
 * React component for rendering file mention chips in the TipTap editor.
 * Displays as an atomic inline chip with a file icon.
 */

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

export function FileMentionComponent({ node }: NodeViewProps) {
  const { label } = node.attrs

  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-primary/10 text-primary text-sm font-medium whitespace-nowrap"
      contentEditable={false}
    >
      <FileIcon />
      <span>@{label}</span>
    </NodeViewWrapper>
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
