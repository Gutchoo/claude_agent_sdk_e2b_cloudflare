/**
 * Header Component
 *
 * Simplified header with:
 * - App title
 * - Connection status indicator
 * - Theme toggle
 */

import { Button } from '@/components/ui/button'
import type { ConnectionStatus } from '@/types/e2b'
import type { SandboxStatus } from '@/hooks/useE2BWebSocket'

interface HeaderProps {
  connectionStatus: ConnectionStatus
  sandboxStatus: SandboxStatus
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Header({ connectionStatus, sandboxStatus, theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="border-b border-border px-3 py-1.5 flex items-center justify-between bg-card">
      <h1 className="text-sm font-semibold text-muted-foreground">Claude Agent</h1>

      <div className="flex items-center gap-4">
        {/* Status Indicators */}
        <div className="flex items-center gap-4">
          <StatusIndicator label="Sandbox" status={sandboxStatus} type="sandbox" />
          <StatusIndicator label="WebSocket" status={connectionStatus} type="connection" />
        </div>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleTheme}
          className="h-6 w-6 p-0"
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </Button>
      </div>
    </header>
  )
}

interface StatusIndicatorProps {
  label: string
  status: ConnectionStatus | SandboxStatus
  type: 'connection' | 'sandbox'
}

function StatusIndicator({ label, status, type }: StatusIndicatorProps) {
  const connectionConfig = {
    disconnected: { text: 'Disconnected', color: 'bg-red-500', animate: false },
    connecting: { text: 'Connecting...', color: 'bg-yellow-500', animate: true },
    connected: { text: 'Connected', color: 'bg-green-500', animate: false },
  }

  const sandboxConfig = {
    unknown: { text: 'Unknown', color: 'bg-gray-500', animate: false },
    alive: { text: 'Alive', color: 'bg-green-500', animate: false },
    dead: { text: 'Dead', color: 'bg-red-500', animate: false },
  }

  const config = type === 'connection' ? connectionConfig : sandboxConfig
  const { text, color, animate } = config[status as keyof typeof config]

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`w-1.5 h-1.5 rounded-full ${color} ${animate ? 'animate-pulse' : ''}`} />
        {text}
      </div>
    </div>
  )
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}
