/**
 * useFileUpload Hook
 *
 * Manages file upload state and operations for a session.
 * Handles the full upload flow: get URL -> upload to R2 -> confirm.
 */

import { useState, useCallback, useEffect } from 'react'
import type { SessionFile, FileUpload } from '@/types/e2b'
import {
  getFileUploadUrl,
  uploadFileToR2,
  confirmFileUpload,
  listSessionFiles,
  deleteFile,
  getFileDownloadUrl,
} from '@/lib/api'

interface UseFileUploadReturn {
  files: SessionFile[]
  uploads: FileUpload[]
  isLoading: boolean
  uploadFile: (file: File) => Promise<void>
  removeFile: (fileId: string) => Promise<void>
  downloadFile: (fileId: string) => Promise<void>
  refreshFiles: () => Promise<void>
}

export function useFileUpload(sessionId: string | null): UseFileUploadReturn {
  const [files, setFiles] = useState<SessionFile[]>([])
  const [uploads, setUploads] = useState<FileUpload[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Fetch files when session changes
  useEffect(() => {
    if (sessionId) {
      refreshFiles()
    } else {
      setFiles([])
    }
  }, [sessionId])

  const refreshFiles = useCallback(async () => {
    if (!sessionId) return

    setIsLoading(true)
    try {
      const sessionFiles = await listSessionFiles(sessionId)
      setFiles(sessionFiles)
    } catch (error) {
      console.error('Failed to fetch files:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  const uploadFile = useCallback(async (file: File) => {
    if (!sessionId) {
      throw new Error('No session selected')
    }

    // Create upload record
    const uploadId = crypto.randomUUID()
    const newUpload: FileUpload = {
      id: uploadId,
      filename: file.name,
      status: 'pending',
      progress: 0,
    }

    setUploads((prev) => [...prev, newUpload])

    try {
      // Step 1: Get presigned upload URL
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, status: 'pending' } : u))
      )

      const { file_id, upload_url, file: fileRecord } = await getFileUploadUrl(
        sessionId,
        file.name,
        file.type || 'application/octet-stream',
        file.size
      )

      // Update upload with real file ID
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId ? { ...u, id: file_id, status: 'uploading' } : u
        )
      )

      // Step 2: Upload to R2
      await uploadFileToR2(upload_url, file, (progress) => {
        setUploads((prev) =>
          prev.map((u) => (u.id === file_id ? { ...u, progress } : u))
        )
      })

      // Step 3: Confirm upload
      setUploads((prev) =>
        prev.map((u) =>
          u.id === file_id ? { ...u, status: 'confirming', progress: 100 } : u
        )
      )

      await confirmFileUpload(sessionId, file_id)

      // Step 4: Mark complete and refresh file list
      setUploads((prev) =>
        prev.map((u) =>
          u.id === file_id ? { ...u, status: 'complete' } : u
        )
      )

      // Add to files list immediately
      setFiles((prev) => [fileRecord, ...prev])

      // Remove from uploads after a short delay
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.id !== file_id))
      }, 2000)
    } catch (error) {
      console.error('Upload failed:', error)
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? {
                ...u,
                status: 'error',
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : u
        )
      )
    }
  }, [sessionId])

  const removeFile = useCallback(async (fileId: string) => {
    if (!sessionId) return

    try {
      await deleteFile(sessionId, fileId)
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (error) {
      console.error('Failed to delete file:', error)
      throw error
    }
  }, [sessionId])

  const downloadFile = useCallback(async (fileId: string) => {
    if (!sessionId) return

    try {
      const { download_url, file } = await getFileDownloadUrl(sessionId, fileId)

      // Create a temporary link and click it to trigger download
      const link = document.createElement('a')
      link.href = download_url
      link.download = file.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Failed to download file:', error)
      throw error
    }
  }, [sessionId])

  return {
    files,
    uploads,
    isLoading,
    uploadFile,
    removeFile,
    downloadFile,
    refreshFiles,
  }
}
