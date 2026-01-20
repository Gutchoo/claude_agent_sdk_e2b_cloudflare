/**
 * E2B Sessions Hook
 *
 * Manages session list and selection.
 * - Load sessions from /api/sessions
 * - Delete sessions via REST
 * - No file operations
 *
 * Note: Message history loading is handled by useE2BWebSocket hook
 */

import { useState, useEffect, useCallback } from 'react'
import { listSessions, deleteSession as apiDeleteSession } from '@/lib/api'
import type { E2BSession } from '@/types/e2b'

interface UseE2BSessionsReturn {
  sessions: E2BSession[]
  currentSession: E2BSession | null
  isLoading: boolean
  error: string | null
  selectSession: (sessionId: string) => void
  startNewSession: () => void
  deleteSession: (sessionId: string) => Promise<void>
  refreshSessions: () => Promise<void>
}

export function useE2BSessions(): UseE2BSessionsReturn {
  const [sessions, setSessions] = useState<E2BSession[]>([])
  const [currentSession, setCurrentSession] = useState<E2BSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await listSessions()
      // Sort by updated_at descending (most recent first)
      const sorted = [...data].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      setSessions(sorted)
    } catch (err) {
      console.error('Failed to load sessions:', err)
      setError('Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }

  const selectSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      setCurrentSession(session)
    }
  }, [sessions])

  const startNewSession = useCallback(() => {
    // Clear current session - WebSocket hook will create new on connect
    setCurrentSession(null)
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await apiDeleteSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))

      // If we deleted the current session, clear it
      if (currentSession?.id === sessionId) {
        setCurrentSession(null)
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
      throw err
    }
  }, [currentSession])

  const refreshSessions = useCallback(async () => {
    // Don't set isLoading for refresh - only for initial load
    try {
      setError(null)
      const data = await listSessions()
      const sorted = [...data].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      setSessions(sorted)
    } catch (err) {
      console.error('Failed to refresh sessions:', err)
      setError('Failed to refresh sessions')
    }
  }, [])

  return {
    sessions,
    currentSession,
    isLoading,
    error,
    selectSession,
    startNewSession,
    deleteSession,
    refreshSessions,
  }
}
