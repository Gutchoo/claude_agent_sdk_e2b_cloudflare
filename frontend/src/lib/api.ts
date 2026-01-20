/**
 * E2B Backend API Client
 *
 * Simple REST client for E2B backend endpoints.
 * No file operations - E2B doesn't support file upload via REST.
 */

import type {
  E2BSession,
  E2BMessage,
  SessionsResponse,
  MessagesResponse,
  DeleteResponse,
  SessionFile,
  FileUploadUrlResponse,
  FileConfirmResponse,
  FilesResponse,
  FileDownloadUrlResponse,
  FileDeleteResponse,
} from '@/types/e2b'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

/**
 * List all sessions for a user.
 * GET /api/sessions?user_id=default
 */
export async function listSessions(userId: string = 'default'): Promise<E2BSession[]> {
  const response = await fetch(`${API_URL}/api/sessions?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) {
    throw new Error('Failed to list sessions')
  }
  const data: SessionsResponse = await response.json()
  return data.sessions
}

/**
 * Get chat history for a session.
 * GET /api/sessions/{id}/messages
 */
export async function getMessages(sessionId: string): Promise<E2BMessage[]> {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`)
  if (!response.ok) {
    throw new Error('Failed to get messages')
  }
  const data: MessagesResponse = await response.json()
  return data.messages
}

/**
 * Delete a session and its associated data.
 * DELETE /api/sessions/{id}
 */
export async function deleteSession(sessionId: string): Promise<DeleteResponse> {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete session')
  }
  return response.json()
}

/**
 * Get WebSocket URL for chat connection.
 * WebSocket at /ws/chat with query params for session_id and user_id.
 */
export function getWebSocketUrl(sessionId: string | null, userId: string = 'default'): string {
  const wsUrl = API_URL.replace('http', 'ws')
  const params = new URLSearchParams({ user_id: userId })
  if (sessionId) {
    params.set('session_id', sessionId)
  }
  return `${wsUrl}/ws/chat?${params.toString()}`
}

// File upload/download API functions

/**
 * Get a presigned URL for uploading a file.
 * POST /api/sessions/{id}/files/upload-url
 */
export async function getFileUploadUrl(
  sessionId: string,
  filename: string,
  contentType: string,
  sizeBytes: number
): Promise<FileUploadUrlResponse> {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/files/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      content_type: contentType,
      size_bytes: sizeBytes,
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get upload URL' }))
    throw new Error(error.detail || 'Failed to get upload URL')
  }
  return response.json()
}

/**
 * Upload a file directly to R2 using a presigned URL.
 * Returns progress updates via callback.
 */
export function uploadFileToR2(
  uploadUrl: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100)
        onProgress(progress)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', (event) => {
      console.error('XHR error event:', event)
      reject(new Error('Upload failed - likely a CORS issue. Check R2 bucket CORS settings.'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })

    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.send(file)
  })
}

/**
 * Confirm a file upload completed successfully.
 * POST /api/sessions/{id}/files/{file_id}/confirm
 */
export async function confirmFileUpload(
  sessionId: string,
  fileId: string
): Promise<FileConfirmResponse> {
  const response = await fetch(
    `${API_URL}/api/sessions/${sessionId}/files/${fileId}/confirm`,
    { method: 'POST' }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to confirm upload' }))
    throw new Error(error.detail || 'Failed to confirm upload')
  }
  return response.json()
}

/**
 * List all files for a session.
 * GET /api/sessions/{id}/files
 */
export async function listSessionFiles(sessionId: string): Promise<SessionFile[]> {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/files`)
  if (!response.ok) {
    throw new Error('Failed to list files')
  }
  const data: FilesResponse = await response.json()
  return data.files
}

/**
 * Delete a file (soft delete).
 * DELETE /api/sessions/{id}/files/{file_id}
 */
export async function deleteFile(
  sessionId: string,
  fileId: string
): Promise<FileDeleteResponse> {
  const response = await fetch(
    `${API_URL}/api/sessions/${sessionId}/files/${fileId}`,
    { method: 'DELETE' }
  )
  if (!response.ok) {
    throw new Error('Failed to delete file')
  }
  return response.json()
}

/**
 * Get a presigned URL for downloading a file.
 * GET /api/sessions/{id}/files/{file_id}/download-url
 */
export async function getFileDownloadUrl(
  sessionId: string,
  fileId: string
): Promise<FileDownloadUrlResponse> {
  const response = await fetch(
    `${API_URL}/api/sessions/${sessionId}/files/${fileId}/download-url`
  )
  if (!response.ok) {
    throw new Error('Failed to get download URL')
  }
  return response.json()
}
