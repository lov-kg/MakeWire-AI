import { Blocks, Cable, Check, Code2, Cpu, type LucideIcon } from 'lucide-react'
import type { Stage } from '../types'
import { cn } from '../lib/utils'

export const STAGES: Array<{ id: Stage; label: string; hint: string; icon: LucideIcon }> = [
  { id: 'board', label: 'Board', hint: 'Pick your MCU', icon: Cpu },
  { id: 'components', label: 'Components', hint: 'Add modules', icon: Blocks },
  { id: 'wiring', label: 'Wiring', hint: 'Verify every pin', icon: Cable },
  { id: 'code', label: 'Code', hint: 'Generate firmware', icon: Code2 },
]

export function StageNav({
  stage,
  onStage,
  completed,
  variant = 'sidebar',
}: {
  stage: Stage
  onStage: (stage: Stage) => void
  completed: Record<Stage, boolean>
  variant?: 'sidebar' | 'mobile'
}) {
  if (variant === 'mobile') {
    const activeIndex = STAGES.findIndex((item) => item.id === stage)
    return (
      <nav aria-label="Workflow" className="stage-nav-mobile lg:hidden">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
            Step {activeIndex + 1} of {STAGES.length}
          </p>
          <p className="truncate font-mono text-[9px] uppercase tracking-wider text-mint-400/80">
            {STAGES[activeIndex]?.hint}
          </p>
        </div>
        <ol className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {STAGES.map((item, index) => {
            const active = item.id === stage
            const Icon = item.icon
            const done = completed[item.id] && !active
            return (
              <li key={item.id} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onStage(item.id)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition duration-200 ease-premium active:scale-[0.985]',
                    active
                      ? 'border-mint-400/30 bg-mint-400/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                      : done
                        ? 'border-mint-400/15 bg-mint-400/[0.04] text-slate-300'
                        : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/15',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px]',
                      active
                        ? 'border-mint-400/40 bg-mint-400/15 text-mint-300'
                        : done
                          ? 'border-mint-400/20 bg-mint-400/10 text-mint-400'
                          : 'border-white/10 text-slate-500',
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold">{item.label}</span>
                  </span>
                  {active ? <Icon className="ml-auto h-3.5 w-3.5 shrink-0 text-mint-300" /> : null}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
    )
  }

  const activeIndex = STAGES.findIndex((item) => item.id === stage)
  const progress = ((activeIndex + 1) / STAGES.length) * 100

  return (
    <nav aria-label="Workflow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="eyebrow">Workflow</p>
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
          {activeIndex + 1}/{STAGES.length}
        </span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
        <div
          className="h-full rounded-full bg-mint-400/70 transition-all duration-500 ease-premium"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="space-y-1.5">
        {STAGES.map((item, index) => {
          const active = item.id === stage
          const Icon = item.icon
          const done = completed[item.id] && !active
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onStage(item.id)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition duration-200 ease-premium',
                  active
                    ? 'border-mint-400/25 bg-mint-400/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                    : 'border-transparent text-slate-400 hover:border-white/[0.07] hover:bg-white/[0.03]',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] transition',
                    active
                      ? 'border-mint-400/30 bg-mint-400/10 text-mint-300'
                      : done
                        ? 'border-mint-400/20 bg-mint-400/[0.06] text-mint-400'
                        : 'border-white/10 bg-white/[0.02] text-slate-500',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-semibold', active ? 'text-white' : 'text-slate-300')}>
                    {item.label}
                  </span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {item.hint}
                  </span>
                </span>
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition duration-200',
                    active ? 'text-mint-300' : done ? 'text-mint-500/60' : 'text-slate-600 group-hover:text-slate-500',
                  )}
                />
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
