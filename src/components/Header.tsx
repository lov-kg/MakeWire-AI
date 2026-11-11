import { AlertTriangle, Check, CircuitBoard, CloudOff, Loader2, Plus } from 'lucide-react'
import type { Project } from '../types'
import { Button, IconButton } from './ui'
import { cn } from '../lib/utils'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function Header({
  projects,
  activeProjectId,
  project,
  saveState,
  onSelectProject,
  onCreateProject,
}: {
  projects: Project[]
  activeProjectId: string
  project: Project
  saveState: SaveState
  onSelectProject: (id: string) => void
  onCreateProject: () => void
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-mint-400/25 bg-mint-400/10 text-mint-300">
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
          <label htmlFor="project-select" className="sr-only">
            Active project
          </label>
          <select
            id="project-select"
            value={activeProjectId}
            onChange={(event) => onSelectProject(event.target.value)}
            className="h-9 max-w-[11rem] truncate rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition hover:border-white/20 focus:border-mint-400/60 focus:outline-none sm:max-w-[16rem]"
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id} className="bg-ink-900">
                {item.name}
              </option>
            ))}
          </select>

          <IconButton label="Create a new project" onClick={onCreateProject}>
            <Plus className="h-4 w-4" />
          </IconButton>

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
            {saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Save failed' : saveState === 'saved' ? 'Saved locally' : 'Local'}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 pb-3 lg:hidden">
        <p className="truncate text-xs font-medium text-slate-400">{project.name}</p>
        <Button size="sm" variant="ghost" onClick={onCreateProject}>
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>
    </header>
  )
}
