import { useRef, type ChangeEvent } from 'react'
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Cpu,
  Download,
  HardDrive,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import type { Project, Stage, WorkspaceData } from '../types'
import type { ApiHealth } from '../lib/ai'
import type { CloudSession } from '../lib/supabase'
import type { SettingsTab } from './SettingsModal'
import { Accordion, Badge, Button } from './ui'
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
  cloudSession,
  cloudConfigured,
  onSettings,
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
  cloudSession: CloudSession | null
  cloudConfigured: boolean
  onSettings: (tab?: SettingsTab) => void
  onRenameProject: (name: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const aiReady = Boolean(apiHealth?.ai.workersAi || apiHealth?.ai.openai || apiHealth?.ai.gemini)

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onImport(file)
    event.target.value = ''
  }

  return (
    <aside className="hidden w-72 shrink-0 lg:block">
      <div className="sticky top-24 space-y-4">
        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor="project-name" className="eyebrow">
              Project
            </label>
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
              {workspace.projects.length} total
            </span>
          </div>
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
            {cloudSession ? (
              <Badge tone="sky">
                <Cloud className="h-3 w-3" />
                synced
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="panel p-4">
          <StageNav stage={stage} onStage={onStage} completed={completed} />
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Board snapshot</p>
            <Cpu className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{boardName ?? 'No board selected'}</p>
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

        <div className="space-y-2">
          <Accordion
            title="Integrations"
            description="AI provider and cloud sync"
            icon={<Sparkles className="h-4 w-4" />}
            defaultOpen
            badge={
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  aiReady || cloudSession ? 'bg-mint-400' : 'bg-slate-600',
                )}
              />
            }
          >
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onSettings('ai')}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-mint-300">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-slate-200">Gemini AI</span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {aiReady ? apiHealth?.ai.model ?? 'provider configured' : 'local engine only'}
                  </span>
                </span>
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', aiReady ? 'bg-mint-400' : 'bg-amber-400')}
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                onClick={() => onSettings('cloud')}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-sky-300">
                  {cloudSession ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-slate-200">Supabase</span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {cloudSession ? cloudSession.email ?? 'signed in' : cloudConfigured ? 'configured' : 'not configured'}
                  </span>
                </span>
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', cloudSession ? 'bg-mint-400' : 'bg-slate-600')}
                  aria-hidden="true"
                />
              </button>

              <p className="flex items-start gap-1.5 px-2 pt-1 text-[10px] leading-relaxed text-slate-600">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-mint-500" />
                The pin map stays authoritative. AI output is always an enhancement.
              </p>
            </div>
          </Accordion>

          <Accordion
            title="Project data"
            description="Export, import or reset"
            icon={<HardDrive className="h-4 w-4" />}
          >
            <div className="space-y-2">
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
              <Button size="sm" variant="ghost" className="w-full" onClick={onReset}>
                <RefreshCcw className="h-3.5 w-3.5" />
                Restore demo project
              </Button>
              <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                IndexedDB primary, localStorage mirror. Nothing leaves this browser unless you enable cloud sync or ask the AI.
              </p>
            </div>
          </Accordion>
        </div>
      </div>
    </aside>
  )
}
