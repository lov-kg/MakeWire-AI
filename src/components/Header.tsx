import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircuitBoard,
  Cloud,
  CloudOff,
  FolderOpen,
  HardDrive,
  Loader2,
  Plus,
  Settings,
  Sparkles,
} from 'lucide-react'
import type { Project } from '../types'
import type { CloudSession } from '../lib/supabase'
import { Button, IconButton } from './ui'
import type { SettingsTab } from './SettingsModal'
import { cn } from '../lib/utils'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function Header({
  projects,
  activeProjectId,
  project,
  saveState,
  cloudSession,
  cloudConfigured,
  onSelectProject,
  onCreateProject,
  onSettings,
}: {
  projects: Project[]
  activeProjectId: string
  project: Project
  saveState: SaveState
  cloudSession: CloudSession | null
  cloudConfigured: boolean
  onSelectProject: (id: string) => void
  onCreateProject: () => void
  onSettings: (tab?: SettingsTab) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const cloudState = cloudSession
    ? 'synced'
    : cloudConfigured
      ? 'configured'
      : 'local'

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-mint-400/25 bg-mint-400/10 text-mint-300 shadow-[0_0_24px_-8px_rgba(84,230,177,0.55)]">
            <CircuitBoard className="h-5 w-5" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-mint-400 shadow-[0_0_10px_2px_rgba(84,230,177,0.6)]" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-tight text-white">
              MakerWire <span className="text-mint-400">AI</span>
            </p>
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:block">
              parts → pins → firmware
            </p>
          </div>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="relative min-w-0" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
              className={cn(
                'flex h-9 min-w-0 max-w-[10rem] items-center gap-2 rounded-xl border px-3 text-xs font-medium transition duration-200 sm:max-w-[17rem]',
                menuOpen
                  ? 'border-mint-400/40 bg-mint-400/[0.08] text-white'
                  : 'border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.06]',
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              <span className="truncate">{project.name}</span>
              <ChevronDown
                className={cn('h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200', menuOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Projects"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 origin-top-right animate-menu-in overflow-hidden rounded-xl border border-white/10 bg-ink-850/98 shadow-panel backdrop-blur-xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    {projects.length} project{projects.length === 1 ? '' : 's'}
                  </p>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">local</span>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5" role="none">
                  {projects.map((item) => {
                    const active = item.id === activeProjectId
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          onSelectProject(item.id)
                          setMenuOpen(false)
                        }}
                        className={cn(
                          'menu-item',
                          active && 'bg-mint-400/[0.09] text-white',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                            active
                              ? 'border-mint-400/30 bg-mint-400/10 text-mint-300'
                              : 'border-white/10 bg-white/[0.02] text-slate-500',
                          )}
                        >
                          {active ? <Check className="h-3 w-3" /> : <CircuitBoard className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">{item.name}</span>
                          <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
                            {item.components.length} module{item.components.length === 1 ? '' : 's'} ·{' '}
                            {item.codeHistory.length} sketch{item.codeHistory.length === 1 ? '' : 'es'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="border-t border-white/[0.06] p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onCreateProject()
                    }}
                    className="menu-item text-mint-200 hover:bg-mint-400/[0.08] hover:text-mint-100"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-mint-400/25 bg-mint-400/10 text-mint-300">
                      <Plus className="h-3 w-3" />
                    </span>
                    New project
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onSettings('cloud')}
            className={cn(
              'hidden h-9 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] uppercase tracking-wide transition duration-200 md:flex',
              cloudState === 'synced'
                ? 'border-mint-400/25 bg-mint-400/10 text-mint-300 hover:bg-mint-400/[0.16]'
                : cloudState === 'configured'
                  ? 'border-sky-400/20 bg-sky-400/[0.08] text-sky-300 hover:bg-sky-400/[0.14]'
                  : 'border-white/10 bg-white/[0.03] text-slate-500 hover:border-white/20 hover:text-slate-300',
            )}
            title={cloudState === 'synced' ? 'Cloud sync active' : cloudState === 'configured' ? 'Cloud configured — sign in to sync' : 'Local-only workspace'}
          >
            {cloudState === 'synced' ? (
              <Cloud className="h-3 w-3" aria-hidden="true" />
            ) : cloudState === 'configured' ? (
              <Sparkles className="h-3 w-3" aria-hidden="true" />
            ) : (
              <HardDrive className="h-3 w-3" aria-hidden="true" />
            )}
            {cloudState === 'synced' ? 'Cloud' : cloudState === 'configured' ? 'Cloud ready' : 'Local'}
          </button>

          <div
            className={cn(
              'hidden items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide sm:flex',
              saveState === 'error'
                ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
                : saveState === 'saving'
                  ? 'border-sky-400/20 bg-sky-400/10 text-sky-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-400',
            )}
            aria-live="polite"
            title="Local persistence status"
          >
            {saveState === 'saving' ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : saveState === 'error' ? (
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            ) : saveState === 'saved' ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : (
              <CloudOff className="h-3 w-3" aria-hidden="true" />
            )}
            {saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Save failed' : saveState === 'saved' ? 'Saved' : 'Local'}
          </div>

          <IconButton label="Create a new project" onClick={onCreateProject} className="hidden sm:inline-flex">
            <Plus className="h-4 w-4" />
          </IconButton>

          <IconButton label="Open settings" onClick={() => onSettings('ai')}>
            <Settings className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 pb-2.5 sm:px-6 md:hidden">
        <p className="truncate text-xs font-medium text-slate-400">{project.name}</p>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              saveState === 'error'
                ? 'bg-rose-400'
                : saveState === 'saving'
                  ? 'animate-pulse-soft bg-sky-400'
                  : 'bg-mint-400',
            )}
            aria-hidden="true"
          />
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
            {saveState === 'error' ? 'save failed' : saveState === 'saving' ? 'saving' : cloudState === 'synced' ? 'cloud synced' : 'local'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-1 h-8 px-2"
            onClick={() => onSettings('cloud')}
            aria-label="Cloud settings"
          >
            {cloudState === 'synced' ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </header>
  )
}
