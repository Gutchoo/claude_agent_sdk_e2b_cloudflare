/**
 * E2B Backend Types
 *
 * These types match the exact protocol used by the E2B backend.
 * No adapters or transformations - use these directly.
 */

// Session from E2B backend (matches database schema)
export interface E2BSession {
  id: string
  user_id: string
  title: string                    // NOT "name" like Modal
  created_at: string
  updated_at: string
  has_snapshot: number             // 0 or 1 (SQLite boolean)
  sandbox_id: string | null
  sandbox_status: string | null
  claude_session_id: string | null
}

// Message from E2B backend chat history
export interface E2BMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string                // NOT created_at
}

// WebSocket events - exactly as E2B backend sends them
export type E2BEvent =
  | { type: 'session_info'; session_id: string; sandbox_id: string; is_new: boolean; has_snapshot: boolean }
  | { type: 'status'; status: string }
  | { type: 'chunk'; content: string }
  | { type: 'tool_use'; tool_id: string; tool_name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_id: string; tool_name: string; content: string; is_error: boolean; duration: number }
  | { type: 'done'; session_id: string }
  | { type: 'error'; message: string }

// Connection status for UI
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

// Parsed message for display (frontend internal)
export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  toolUses?: ToolUse[]
}

// Tool use with optional result (frontend internal)
export interface ToolUse {
  id: string
  toolName: string
  input: Record<string, unknown>
  result?: string
  isError?: boolean
  duration?: number
}

// API response wrappers (E2B backend returns these)
export interface SessionsResponse {
  sessions: E2BSession[]
}

export interface MessagesResponse {
  messages: E2BMessage[]
  session_id: string
}

export interface DeleteResponse {
  status: 'deleted'
  id: string
}

// Session file stored in R2
export interface SessionFile {
  id: string
  session_id: string
  filename: string
  r2_key: string
  size_bytes: number
  content_type: string
  uploaded_at: string
  is_deleted: number
}

// Active file upload state for UI
export interface FileUpload {
  id: string
  filename: string
  status: 'pending' | 'uploading' | 'confirming' | 'complete' | 'error'
  progress: number
  error?: string
}

// API response for file upload URL
export interface FileUploadUrlResponse {
  file_id: string
  upload_url: string
  file: SessionFile
}

// API response for file confirm
export interface FileConfirmResponse {
  status: 'confirmed'
  file_id: string
  injected: boolean
}

// API response for file list
export interface FilesResponse {
  files: SessionFile[]
  session_id: string
}

// API response for file download URL
export interface FileDownloadUrlResponse {
  download_url: string
  file: SessionFile
}

// API response for file delete
export interface FileDeleteResponse {
  status: 'deleted'
  file_id: string
}
