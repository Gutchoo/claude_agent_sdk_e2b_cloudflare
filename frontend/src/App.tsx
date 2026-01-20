/**
 * App Component
 *
 * Main application with E2B-native architecture:
 * - 3-panel layout: sidebar + chat + files
 * - E2B WebSocket for real-time chat
 * - E2B REST API for session management
 * - File uploads with R2 storage
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { Header } from '@/components/Header'
import { SessionSidebar } from '@/components/SessionSidebar'
import { ChatInterface } from '@/components/ChatInterface'
import { FilePanel } from '@/components/FilePanel'
import { useTheme } from '@/hooks/useTheme'
import { useE2BSessions } from '@/hooks/useE2BSessions'
import { useE2BWebSocket } from '@/hooks/useE2BWebSocket'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Skeleton } from '@/components/ui/skeleton'

function App() {
  const { theme, toggleTheme } = useTheme()
  const [filePanelWidth, setFilePanelWidth] = useState(280)

  const {
    sessions,
    currentSession,
    isLoading: sessionsLoading,
    selectSession,
    startNewSession,
    deleteSession,
    refreshSessions,
  } = useE2BSessions()

  const {
    messages,
    connectionStatus,
    isProcessing,
    isWaitingForResponse,
    currentSessionId,
    elapsedTime,
    sendMessage,
    clearMessages,
  } = useE2BWebSocket(currentSession?.id || null)

  // Use currentSessionId from WebSocket for file operations (captures new sessions)
  const effectiveSessionId = currentSession?.id || currentSessionId

  const {
    files,
    uploads,
    isLoading: filesLoading,
    uploadFile,
    removeFile,
    downloadFile,
  } = useFileUpload(effectiveSessionId)

  // Track which session IDs we've already refreshed for
  const refreshedForRef = useRef<Set<string>>(new Set())

  // Refresh sessions when a new session is created via WebSocket
  useEffect(() => {
    if (currentSessionId &&
        !sessions.find((s) => s.id === currentSessionId) &&
        !refreshedForRef.current.has(currentSessionId)) {
      // New session was created, refresh the list (only once per session)
      refreshedForRef.current.add(currentSessionId)
      refreshSessions()
    }
  }, [currentSessionId, sessions, refreshSessions])

  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId)
  }, [selectSession])

  const handleNewSession = useCallback(() => {
    startNewSession()
    clearMessages()
  }, [startNewSession, clearMessages])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId)
  }, [deleteSession])

  // Show loading state
  if (sessionsLoading) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <div className="text-center space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <Header
        connectionStatus={connectionStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content: 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Sessions */}
        <SessionSidebar
          sessions={sessions}
          currentSessionId={currentSession?.id || currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />

        {/* Center - Chat Interface */}
        <ChatInterface
          messages={messages}
          isConnected={connectionStatus === 'connected'}
          isProcessing={isProcessing}
          isWaitingForResponse={isWaitingForResponse}
          elapsedTime={elapsedTime}
          onSendMessage={sendMessage}
        />

        {/* Right Sidebar - Files */}
        <FilePanel
          files={files}
          uploads={uploads}
          isLoading={filesLoading}
          onUploadFile={uploadFile}
          onDeleteFile={removeFile}
          onDownloadFile={downloadFile}
          disabled={connectionStatus !== 'connected'}
          sessionId={effectiveSessionId}
          width={filePanelWidth}
          onWidthChange={setFilePanelWidth}
        />
      </div>
    </div>
  )
}

export default App
