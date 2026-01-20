/**
 * FilePanel Component
 *
 * Simplified right panel for file management:
 * - Upload files via button or drag-and-drop
 * - Sophisticated animated empty state with centered upload
 * - Animated drag overlay with rotating border
 * - View uploaded files with type-specific icons
 * - Per-file 0-100% upload progress with animations
 * - File preview (images, PDFs, text)
 * - Resizable panel width
 * - Staggered file list animations
 * - Upload button at bottom when files exist
 */

import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  File,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  Download,
  Trash2,
  Eye,
  GripVertical,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SessionFile, FileUpload } from '@/types/e2b'

// ============================================================================
// Types
// ============================================================================

interface FilePanelProps {
  files: SessionFile[]
  uploads: FileUpload[]
  isLoading: boolean
  onUploadFile: (file: File) => Promise<void>
  onDeleteFile: (fileId: string) => Promise<void>
  onDownloadFile: (fileId: string) => Promise<void>
  disabled?: boolean
  sessionId?: string | null
  width?: number
  onWidthChange?: (width: number) => void
}

interface FilePreviewState {
  isOpen: boolean
  file: SessionFile | null
  content: string | null
  loading: boolean
  error: string | null
}

// ============================================================================
// Constants
// ============================================================================

const MIN_PANEL_WIDTH = 200
const MAX_PANEL_WIDTH = 500
const DEFAULT_PANEL_WIDTH = 280

// File type to icon mapping
const FILE_TYPE_ICONS: Record<string, typeof File> = {
  // Documents
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  rtf: FileText,
  md: FileText,
  // Code
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  py: FileCode,
  java: FileCode,
  cpp: FileCode,
  c: FileCode,
  h: FileCode,
  css: FileCode,
  scss: FileCode,
  html: FileCode,
  json: FileCode,
  xml: FileCode,
  yaml: FileCode,
  yml: FileCode,
  // Images
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  bmp: FileImage,
  // Video
  mp4: FileVideo,
  webm: FileVideo,
  mov: FileVideo,
  avi: FileVideo,
  mkv: FileVideo,
  // Audio
  mp3: FileAudio,
  wav: FileAudio,
  ogg: FileAudio,
  flac: FileAudio,
  // Archives
  zip: FileArchive,
  rar: FileArchive,
  '7z': FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  // Spreadsheets
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
}

// ============================================================================
// Helper Functions
// ============================================================================

function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ext
}

function getFileIcon(filename: string) {
  const ext = getFileExtension(filename)
  return FILE_TYPE_ICONS[ext] || File
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function canPreview(filename: string): boolean {
  const ext = getFileExtension(filename)
  const previewableExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp',
    'pdf',
    'txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h',
    'css', 'scss', 'html', 'xml', 'yaml', 'yml', 'csv',
  ]
  return previewableExtensions.includes(ext)
}

function isImageFile(filename: string): boolean {
  const ext = getFileExtension(filename)
  return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)
}

function isPdfFile(filename: string): boolean {
  return getFileExtension(filename) === 'pdf'
}

// ============================================================================
// Animated Components
// ============================================================================

/**
 * Floating particle for empty state animation
 */
function FloatingParticle({ delay, duration }: { delay: number; duration: number }) {
  const randomX = useMemo(() => Math.random() * 100, [])
  const randomSize = useMemo(() => Math.random() * 4 + 2, [])

  return (
    <motion.div
      className="absolute rounded-full bg-primary/20"
      style={{
        width: randomSize,
        height: randomSize,
        left: `${randomX}%`,
      }}
      initial={{ y: '100%', opacity: 0 }}
      animate={{
        y: '-100%',
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  )
}

/**
 * Animated gradient border for empty state
 */
function AnimatedBorderGradient({ isDragging }: { isDragging: boolean }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-xl pointer-events-none"
      style={{
        background: `linear-gradient(90deg,
          transparent,
          hsl(var(--primary) / ${isDragging ? 0.5 : 0.2}),
          transparent
        )`,
        backgroundSize: '200% 100%',
      }}
      animate={{
        backgroundPosition: ['0% 0%', '200% 0%'],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  )
}

/**
 * Animated upload icon with orbiting dots
 */
function AnimatedUploadIcon({ isDragging }: { isDragging: boolean }) {
  return (
    <div className="relative w-16 h-16">
      {/* Central icon */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          y: isDragging ? -8 : [0, -4, 0],
          scale: isDragging ? 1.1 : 1,
        }}
        transition={{
          y: isDragging
            ? { duration: 0.2 }
            : { duration: 2, repeat: Infinity, ease: 'easeInOut' },
          scale: { duration: 0.2 },
        }}
      >
        <Upload className="w-8 h-8 text-primary" />
      </motion.div>

      {/* Orbiting dots */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-primary/60"
          style={{
            top: '50%',
            left: '50%',
          }}
          animate={{
            x: Math.cos((i * 2 * Math.PI) / 3) * 24 - 4,
            y: Math.sin((i * 2 * Math.PI) / 3) * 24 - 4,
            rotate: 360,
          }}
          transition={{
            rotate: {
              duration: 4,
              repeat: Infinity,
              ease: 'linear',
            },
            x: { duration: 0 },
            y: { duration: 0 },
          }}
        />
      ))}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Upload progress item with animated progress bar
 */
function UploadProgressItem({ upload }: { upload: FileUpload }) {
  const Icon = getFileIcon(upload.filename)
  const isComplete = upload.status === 'complete'
  const isError = upload.status === 'error'

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-1.5 p-2 rounded-lg bg-muted/30"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm truncate flex-1">{upload.filename}</span>
        <span className={cn(
          "text-xs shrink-0",
          isError ? "text-destructive" : "text-muted-foreground"
        )}>
          {isError ? (
            <AlertCircle className="w-4 h-4" />
          ) : isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            `${upload.progress}%`
          )}
        </span>
      </div>

      {/* Animated progress bar */}
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn(
            "h-full",
            isError ? 'bg-destructive' :
            isComplete ? 'bg-green-500' : 'bg-primary'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${upload.progress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>

      {upload.error && (
        <p className="text-xs text-destructive truncate">{upload.error}</p>
      )}
    </motion.div>
  )
}

/**
 * File list item with animations
 */
function FileItem({
  file,
  index,
  onPreview,
  onDownload,
  onDelete,
}: {
  file: SessionFile
  index: number
  onPreview: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const Icon = getFileIcon(file.filename)
  const showPreview = canPreview(file.filename)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: index * 0.05 }}
      className="group flex items-center justify-between rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors"
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.filename}>
            {file.filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size_bytes)}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {showPreview && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onPreview}
            title="Preview"
          >
            <Eye className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onDownload}
          title="Download"
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 hover:bg-destructive hover:text-destructive-foreground"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  )
}

/**
 * File preview dialog
 */
function FilePreviewDialog({
  preview,
  onClose,
}: {
  preview: FilePreviewState
  onClose: () => void
}) {
  const { file, content, loading, error } = preview

  if (!file) return null

  const isImage = isImageFile(file.filename)
  const isPdf = isPdfFile(file.filename)

  return (
    <Dialog open={preview.isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate">
            {(() => {
              const Icon = getFileIcon(file.filename)
              return <Icon className="w-5 h-5 shrink-0" />
            })()}
            <span className="truncate">{file.filename}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <AlertCircle className="w-8 h-8 text-destructive" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : isImage && content ? (
            <img
              src={content}
              alt={file.filename}
              className="max-w-full max-h-[70vh] object-contain mx-auto"
            />
          ) : isPdf && content ? (
            <iframe
              src={content}
              className="w-full h-[70vh]"
              title={file.filename}
            />
          ) : content ? (
            <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto max-h-[70vh] whitespace-pre-wrap break-all">
              {content}
            </pre>
          ) : (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-muted-foreground">Unable to preview this file</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Empty state with animated drop zone and centered upload button
 */
function EmptyState({
  isDragging,
  disabled,
  onUploadClick,
}: {
  isDragging: boolean
  disabled: boolean
  onUploadClick: () => void
}) {
  return (
    <motion.div
      className="relative flex flex-col items-center justify-center h-full p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <FloatingParticle
            key={i}
            delay={i * 0.5}
            duration={4 + Math.random() * 2}
          />
        ))}
      </div>

      {/* Animated border */}
      <div className="absolute inset-4 rounded-xl border-2 border-dashed border-muted-foreground/20 overflow-hidden">
        <AnimatedBorderGradient isDragging={isDragging} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        <AnimatedUploadIcon isDragging={isDragging} />
        <div className="text-center space-y-3">
          <p className="text-sm font-medium">
            {isDragging ? 'Drop files here' : 'No files uploaded'}
          </p>
          <p className="text-xs text-muted-foreground">
            Drag and drop files here
          </p>
          {!isDragging && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onUploadClick}
              disabled={disabled}
            >
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Drag overlay with rotating border
 */
function DragOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
    >
      {/* Rotating border */}
      <motion.div
        className="absolute inset-4 rounded-xl border-2 border-primary"
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        style={{
          background: `linear-gradient(90deg, transparent 50%, hsl(var(--primary) / 0.1) 50%)`,
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <FloatingParticle
            key={i}
            delay={i * 0.2}
            duration={2 + Math.random()}
          />
        ))}
      </div>

      {/* Drop indicator */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-3"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Upload className="w-12 h-12 text-primary" />
        <p className="text-lg font-medium text-primary">Drop files here</p>
      </motion.div>
    </motion.div>
  )
}

/**
 * Resize handle for panel
 */
function ResizeHandle({
  onResizeStart,
  isResizing,
}: {
  onResizeStart: (e: React.MouseEvent) => void
  isResizing: boolean
}) {
  return (
    <div
      className={cn(
        "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group",
        "hover:bg-primary/20 transition-colors",
        isResizing && "bg-primary/30"
      )}
      onMouseDown={onResizeStart}
    >
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-3 h-3 text-muted-foreground" />
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FilePanel({
  files,
  uploads,
  isLoading,
  onUploadFile,
  onDeleteFile,
  onDownloadFile,
  disabled = false,
  sessionId: _sessionId,
  width: controlledWidth,
  onWidthChange,
}: FilePanelProps) {
  // Note: sessionId prop is available for future use but currently files have session_id embedded
  void _sessionId
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [internalWidth, setInternalWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [preview, setPreview] = useState<FilePreviewState>({
    isOpen: false,
    file: null,
    content: null,
    loading: false,
    error: null,
  })

  // Use controlled width if provided, otherwise use internal state
  const width = controlledWidth ?? internalWidth
  const setWidth = onWidthChange ?? setInternalWidth

  // Handle file input change
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles) {
      Array.from(selectedFiles).forEach(onUploadFile)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onUploadFile])

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Only set dragging to false if we're leaving the panel entirely
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (disabled) return

    const droppedFiles = e.dataTransfer.files
    if (droppedFiles) {
      Array.from(droppedFiles).forEach(onUploadFile)
    }
  }, [disabled, onUploadFile])

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setWidth(Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, setWidth])

  // File preview handler
  const handlePreview = useCallback(async (file: SessionFile) => {
    setPreview({
      isOpen: true,
      file,
      content: null,
      loading: true,
      error: null,
    })

    try {
      // For images and PDFs, we need the download URL
      const isImage = isImageFile(file.filename)
      const isPdf = isPdfFile(file.filename)

      if (isImage || isPdf) {
        // Get the download URL from the API
        const response = await fetch(
          `http://localhost:8001/api/sessions/${file.session_id}/files/${file.id}/download`
        )
        if (!response.ok) throw new Error('Failed to get download URL')
        const data = await response.json()

        setPreview((prev) => ({
          ...prev,
          content: data.download_url,
          loading: false,
        }))
      } else {
        // For text files, fetch the content
        const response = await fetch(
          `http://localhost:8001/api/sessions/${file.session_id}/files/${file.id}/download`
        )
        if (!response.ok) throw new Error('Failed to get download URL')
        const data = await response.json()

        const contentResponse = await fetch(data.download_url)
        if (!contentResponse.ok) throw new Error('Failed to fetch file content')
        const text = await contentResponse.text()

        setPreview((prev) => ({
          ...prev,
          content: text,
          loading: false,
        }))
      }
    } catch (error) {
      setPreview((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load preview',
      }))
    }
  }, [])

  const closePreview = useCallback(() => {
    setPreview({
      isOpen: false,
      file: null,
      content: null,
      loading: false,
      error: null,
    })
  }, [])

  // Active uploads (not complete)
  const activeUploads = uploads.filter((u) => u.status !== 'complete')
  const hasFiles = files.length > 0

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      className="hidden"
      onChange={handleFileSelect}
      disabled={disabled}
    />
  )

  return (
    <>
      <motion.div
        initial={{ width: DEFAULT_PANEL_WIDTH }}
        animate={{ width }}
        transition={{ duration: isResizing ? 0 : 0.2 }}
        className="relative h-full border-l border-border flex flex-col bg-card overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {fileInput}

        {/* Resize handle */}
        <ResizeHandle onResizeStart={handleResizeStart} isResizing={isResizing} />

        {/* Drag overlay */}
        <AnimatePresence>
          {isDragging && <DragOverlay />}
        </AnimatePresence>

        {/* Main content area */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasFiles && activeUploads.length === 0 ? (
            <EmptyState
              isDragging={isDragging}
              disabled={disabled}
              onUploadClick={triggerFileInput}
            />
          ) : (
            <>
              {/* Active uploads */}
              <AnimatePresence mode="popLayout">
                {activeUploads.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-3 border-b border-border space-y-2 overflow-hidden shrink-0"
                  >
                    {activeUploads.map((upload) => (
                      <UploadProgressItem key={upload.id} upload={upload} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Files list */}
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                <AnimatePresence mode="popLayout">
                  {files.map((file, index) => (
                    <FileItem
                      key={file.id}
                      file={file}
                      index={index}
                      onPreview={() => handlePreview(file)}
                      onDownload={() => onDownloadFile(file.id)}
                      onDelete={() => onDeleteFile(file.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Bottom upload button */}
              <div className="p-3 border-t border-border shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center gap-2"
                  onClick={triggerFileInput}
                  disabled={disabled}
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload File</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Preview dialog */}
      <FilePreviewDialog preview={preview} onClose={closePreview} />
    </>
  )
}
