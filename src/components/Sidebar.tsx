import { useRef, type ChangeEvent } from 'react'
import {
  CheckCircle2,
  Cloud,
  Download,
  HardDrive,
  RefreshCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import type { Project, Stage, WorkspaceData } from '../types'
import type { ApiHealth } from '../lib/ai'
import { Badge, Button } from './ui'
import { StageNav } from './StageNav'
import { cn } from '../lib/utils'

export function Sidebar({
  stage,
  onStage,
  completed,
  project,
  boardName,
  boardChip,
  componentCount,
  wiringStatus,
  codeCount,
  apiHealth,
  workspace,
  onRenameProject,
  onExport,
  onImport,
  onReset,
}: {
  stage: Stage
  onStage: (stage: Stage) => void
  completed: Record<Stage, boolean>
  project: Project
  boardName: string | null
  boardChip: string | null
  componentCount: number
  wiringStatus: 'ready' | 'attention' | 'blocked'
  codeCount: number
  apiHealth: ApiHealth | null
  workspace: WorkspaceData
  onRenameProject: (name: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cloudReady = Boolean(apiHealth?.ai.workersAi || apiHealth?.ai.openai)

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onImport(file)
    event.target.value = ''
  }

  return (
    <aside className="hidden w-72 shrink-0 lg:block">
      <div className="sticky top-24 space-y-4">
        <div className="panel p-4">
          <label htmlFor="project-name" className="eyebrow mb-2 block">
            Project
          </label>
          <input
            id="project-name"
            value={project.name}
            onChange={(event) => onRenameProject(event.target.value)}
            className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-sm font-semibold text-white transition hover:border-white/10 focus:border-mint-400/40 focus:bg-ink-950/50 focus:outline-none"
            maxLength={64}
          />
          <div className="mt-3 flex items-center gap-2">
            <Badge tone={wiringStatus === 'blocked' ? 'rose' : wiringStatus === 'attention' ? 'amber' : 'mint'}>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  wiringStatus === 'blocked'
                    ? 'bg-rose-400'
                    : wiringStatus === 'attention'
                      ? 'bg-amber-400'
                      : 'bg-mint-400',
                )}
              />
              {wiringStatus}
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {workspace.projects.length} project{workspace.projects.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="panel p-4">
          <StageNav stage={stage} onStage={onStage} completed={completed} />
        </div>

        <div className="panel p-4">
          <p className="eyebrow mb-3">Board snapshot</p>
          <p className="text-sm font-semibold text-white">{boardName ?? 'No board selected'}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {boardChip ?? 'Choose a target to start'}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <div className="panel-inset px-3 py-2">
              <dt className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Modules</dt>
              <dd className="mt-0.5 font-mono text-base text-white">{componentCount}</dd>
            </div>
            <div className="panel-inset px-3 py-2">
              <dt className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Sketches</dt>
              <dd className="mt-0.5 font-mono text-base text-white">{codeCount}</dd>
            </div>
          </dl>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">AI layer</p>
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                cloudReady ? 'bg-mint-400 shadow-[0_0_8px_2px_rgba(84,230,177,0.45)]' : 'bg-amber-400',
              )}
            />
          </div>
          <div className="mt-2 flex items-start gap-2">
            {cloudReady ? (
              <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-mint-300" aria-hidden="true" />
            ) : (
              <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200">
                {cloudReady ? 'Cloud enhancement ready' : 'Local engine only'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {cloudReady
                  ? apiHealth?.ai.model ?? 'AI provider configured on the Pages deployment.'
                  : 'Wiring and pin-correct code still work offline. Configure Workers AI for free-form synthesis.'}
              </p>
            </div>
          </div>
          {cloudReady ? (
            <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <ShieldCheck className="h-3 w-3 text-mint-400" />
              pin map stays authoritative
            </p>
          ) : null}
        </div>

        <div className="panel p-4">
          <p className="eyebrow mb-3">Project data</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
          </div>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
          <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={onReset}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Restore demo project
          </Button>
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-600">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
            IndexedDB primary, localStorage mirror. Nothing leaves this browser unless you ask the AI to.
          </p>
        </div>
      </div>
    </aside>
  )
}
