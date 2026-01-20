/**
 * E2B WebSocket Hook
 *
 * Handles WebSocket connection to E2B backend.
 * - Connect: ws://localhost:8001/ws/chat?session_id={id}&user_id=default
 * - Send: Plain text messages (not JSON)
 * - Receive: E2B events (session_info, status, chunk, tool_use, tool_result, done, error)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getWebSocketUrl, getMessages } from '@/lib/api'
import type { E2BEvent, ConnectionStatus, DisplayMessage, ToolUse, E2BMessage } from '@/types/e2b'

interface UseE2BWebSocketReturn {
  messages: DisplayMessage[]
  connectionStatus: ConnectionStatus
  isProcessing: boolean
  isWaitingForResponse: boolean
  currentSessionId: string | null
  sandboxId: string | null
  elapsedTime: number
  sendMessage: (content: string, fileIds?: string[], model?: string) => void
  clearMessages: () => void
}

// Convert E2B message to display format
function convertToDisplayMessage(msg: E2BMessage): DisplayMessage {
  return {
    id: crypto.randomUUID(),
    role: msg.role,
    content: msg.content,
    timestamp: parseTimestamp(msg.timestamp),
  }
}

// Parse timestamp, treating timestamps without timezone as UTC
function parseTimestamp(timestamp: string): Date {
  if (!timestamp.includes('+') && !timestamp.includes('Z') && !timestamp.includes('-', 10)) {
    return new Date(timestamp + 'Z')
  }
  return new Date(timestamp)
}

export function useE2BWebSocket(sessionId: string | null): UseE2BWebSocketReturn {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sandboxId, setSandboxId] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const accumulatedContentRef = useRef<string>('')
  const toolUsesRef = useRef<ToolUse[]>([])
  const currentMessageIdRef = useRef<string | null>(null)
  const previousSessionIdRef = useRef<string | null>(null)
  const timerStartRef = useRef<number | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer control functions
  const startTimer = useCallback(() => {
    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
    }
    timerStartRef.current = Date.now()
    setElapsedTime(0)
    timerIntervalRef.current = setInterval(() => {
      if (timerStartRef.current) {
        setElapsedTime(Date.now() - timerStartRef.current)
      }
    }, 100) // Update every 100ms for smooth display
  }, [])

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    // Keep final elapsed time displayed
  }, [])

  // Handle event processing
  const handleEvent = useCallback((event: E2BEvent) => {
    switch (event.type) {
      case 'session_info':
        setCurrentSessionId(event.session_id)
        setSandboxId(event.sandbox_id)
        console.log(`Session info: ${event.session_id}, new: ${event.is_new}, snapshot: ${event.has_snapshot}`)
        break

      case 'status':
        if (event.status === 'processing') {
          setIsProcessing(true)
          setIsWaitingForResponse(false)  // No longer waiting, now processing
          // Create placeholder for assistant message
          const assistantId = crypto.randomUUID()
          currentMessageIdRef.current = assistantId
          accumulatedContentRef.current = ''
          toolUsesRef.current = []

          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              content: '',
              timestamp: new Date(),
              toolUses: [],
            },
          ])
        }
        break

      case 'chunk':
        accumulatedContentRef.current += event.content
        // Update the current assistant message with accumulated content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentMessageIdRef.current
              ? { ...msg, content: accumulatedContentRef.current }
              : msg
          )
        )
        break

      case 'tool_use':
        const newToolUse: ToolUse = {
          id: event.tool_id,
          toolName: event.tool_name,
          input: event.input,
        }
        toolUsesRef.current.push(newToolUse)
        // Update message with tool uses
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentMessageIdRef.current
              ? { ...msg, toolUses: [...toolUsesRef.current] }
              : msg
          )
        )
        break

      case 'tool_result':
        // Find and update the matching tool use
        const toolIndex = toolUsesRef.current.findIndex((t) => t.id === event.tool_id)
        if (toolIndex >= 0) {
          toolUsesRef.current[toolIndex] = {
            ...toolUsesRef.current[toolIndex],
            result: event.content,
            isError: event.is_error,
            duration: event.duration,
          }
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentMessageIdRef.current
                ? { ...msg, toolUses: [...toolUsesRef.current] }
                : msg
            )
          )
        }
        break

      case 'done':
        setIsProcessing(false)
        setIsWaitingForResponse(false)
        stopTimer()
        currentMessageIdRef.current = null
        break

      case 'error':
        console.error('Server error:', event.message)
        setIsProcessing(false)
        setIsWaitingForResponse(false)
        stopTimer()
        // Add error as assistant message content if we have a current message
        if (currentMessageIdRef.current) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentMessageIdRef.current
                ? { ...msg, content: `Error: ${event.message}` }
                : msg
            )
          )
        }
        currentMessageIdRef.current = null
        break
    }
  }, [stopTimer])

  // Connect to WebSocket when sessionId changes
  useEffect(() => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Reset state when session changes
    setMessages([])
    setConnectionStatus('connecting')
    setIsProcessing(false)
    setIsWaitingForResponse(false)
    setElapsedTime(0)
    accumulatedContentRef.current = ''
    toolUsesRef.current = []
    currentMessageIdRef.current = null
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    // Load message history if connecting to existing session
    const loadHistoryIfNeeded = async () => {
      if (sessionId && sessionId === previousSessionIdRef.current) {
        // Same session, skip history load
        return
      }

      if (sessionId) {
        try {
          const history = await getMessages(sessionId)
          if (history.length > 0) {
            setMessages(history.map(convertToDisplayMessage))
          }
        } catch (err) {
          console.error('Failed to load message history:', err)
        }
      }
      previousSessionIdRef.current = sessionId
    }

    loadHistoryIfNeeded()

    // Create new WebSocket connection
    const url = getWebSocketUrl(sessionId)
    console.log(`Connecting to WebSocket: ${url}`)

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected')
      setConnectionStatus('connected')
    }

    ws.onmessage = (event) => {
      try {
        const data: E2BEvent = JSON.parse(event.data)
        handleEvent(data)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setConnectionStatus('disconnected')
      setIsProcessing(false)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setConnectionStatus('disconnected')
      setIsProcessing(false)
    }

    return () => {
      ws.close()
    }
  }, [sessionId, handleEvent])

  const sendMessage = useCallback((content: string, fileIds?: string[], model?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected')
      return
    }

    // Start the response timer immediately and mark as waiting
    startTimer()
    setIsWaitingForResponse(true)

    // Add user message immediately
    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Always send JSON format with model field
    wsRef.current.send(JSON.stringify({
      message: content,
      file_ids: fileIds || [],
      model: model || 'opus-4.5'
    }))
  }, [startTimer])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    connectionStatus,
    isProcessing,
    isWaitingForResponse,
    currentSessionId,
    sandboxId,
    elapsedTime,
    sendMessage,
    clearMessages,
  }
}
