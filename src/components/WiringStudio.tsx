import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Cable,
  CheckCircle2,
  CircleSlash,
  CircuitBoard,
  Cpu,
  ExternalLink,
  Gauge,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Unplug,
  Zap,
} from 'lucide-react'
import type { Board, ComponentDefinition, Project, WiringPlan, WarningSeverity } from '../types'
import { requestWiringReview, type WiringReview } from '../lib/ai'
import { getComponent } from '../catalog/registry'
import { connectionColor } from '../lib/wiring'
import { Badge, Button, EmptyState, Panel, ProgressBar, SectionHeading, Spinner, StatCard } from './ui'
import { WiringDiagram } from './WiringDiagram'
import { cn } from '../lib/utils'

const severityTone: Record<WarningSeverity, 'rose' | 'amber' | 'sky'> = {
  danger: 'rose',
  warning: 'amber',
  info: 'sky',
}

const statusCopy = {
  ready: {
    title: 'Plan is ready to wire',
    detail: 'Every required pin found a home and no blocking safety warning was raised. Measure the rails before powering up.',
    tone: 'mint' as const,
    icon: ShieldCheck,
  },
  attention: {
    title: 'Review before you power up',
    detail:
      'The pin map is complete, but at least one warning needs a decision (level shifting, power budget, external supply or a missing interface).',
    tone: 'amber' as const,
    icon: ShieldAlert,
  },
  blocked: {
    title: 'Wiring plan is blocked',
    detail: 'At least one required pin could not be allocated or a required supply is missing. Fix the red items before building.',
    tone: 'rose' as const,
    icon: CircleSlash,
  },
}

export function WiringStudio({
  board,
  project,
  customComponents,
  wiring,
  onContinue,
  onGoComponents,
}: {
  board: Board
  project: Project
  customComponents: ComponentDefinition[]
  wiring: WiringPlan
  onContinue: () => void
  onGoComponents: () => void
}) {
  const [review, setReview] = useState<WiringReview | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  useEffect(() => {
    setReview(null)
    setReviewError(null)
  }, [wiring.generatedAt])

  const handleReview = async () => {
    setReviewBusy(true)
    setReviewError(null)
    try {
      const result = await requestWiringReview(
        board.id,
        project.components,
        customComponents,
        wiring,
        project.prompt,
      )
      setReview(result)
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'The wiring review failed.')
    } finally {
      setReviewBusy(false)
    }
  }

  if (project.components.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeading eyebrow="Step 03 · wiring" title="Nothing to wire yet" />
        <EmptyState
          icon={<Unplug className="h-5 w-5" />}
          title="Add your first module"
          description="The wiring engine needs at least one component. It will allocate power, ground, I2C, SPI and UART automatically."
          action={
            <Button variant="primary" onClick={onGoComponents}>
              Go to components
              <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />
      </div>
    )
  }

  const status = statusCopy[wiring.status]
  const StatusIcon = status.icon
  const dangerCount = wiring.warnings.filter((warning) => warning.severity === 'danger').length

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Step 03 · wiring"
        title={`Wire ${wiring.stats.components} module${wiring.stats.components === 1 ? '' : 's'} to ${board.shortName}`}
        description="Exact board pins, shared buses, power rails and logic-level checks. The diagram and the firmware use this same plan."
        actions={
          <>
            <Button variant="secondary" onClick={() => void handleReview()} disabled={reviewBusy}>
              {reviewBusy ? <Spinner /> : <Bot className="h-4 w-4 text-mint-300" />}
              {reviewBusy ? 'Reviewing…' : 'AI safety review'}
            </Button>
            <Button variant="primary" onClick={onContinue}>
              Generate code
              <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <div
        className={cn(
          'flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-start',
          status.tone === 'mint'
            ? 'border-mint-400/25 bg-mint-400/[0.06]'
            : status.tone === 'amber'
              ? 'border-amber-400/25 bg-amber-400/[0.06]'
              : 'border-rose-400/25 bg-rose-400/[0.06]',
        )}
        role="status"
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
            status.tone === 'mint'
              ? 'border-mint-400/30 bg-mint-400/10 text-mint-300'
              : status.tone === 'amber'
                ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                : 'border-rose-400/30 bg-rose-400/10 text-rose-300',
          )}
        >
          <StatusIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">{status.title}</h2>
            <Badge tone={status.tone === 'mint' ? 'mint' : status.tone === 'amber' ? 'amber' : 'rose'}>
              {wiring.status}
            </Badge>
            {dangerCount > 0 ? <Badge tone="rose">{dangerCount} danger</Badge> : null}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300/80">{status.detail}</p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            <RefreshCw className="h-3 w-3" />
            auto-derived · {new Date(wiring.generatedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connections" value={wiring.stats.connections} hint="power, ground and signals" icon={<Cable className="h-3.5 w-3.5" />} tone="mint" />
        <StatCard label="Signals" value={wiring.stats.signals} hint="excluding power / ground" icon={<Zap className="h-3.5 w-3.5" />} tone="sky" />
        <StatCard label="Board pins" value={wiring.stats.usedBoardPins} hint={`${board.gpioCount} GPIO available`} icon={<Cpu className="h-3.5 w-3.5" />} tone="violet" />
        <StatCard label="Warnings" value={wiring.warnings.length} hint={wiring.warnings.length ? 'read every detail below' : 'no safety flags'} icon={<TriangleAlert className="h-3.5 w-3.5" />} tone={wiring.warnings.length ? 'amber' : 'mint'} />
      </div>

      {wiring.warnings.length > 0 ? (
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
            <div>
              <p className="eyebrow">Safety review</p>
              <h3 className="mt-1 text-base font-semibold text-white">Resolve these before powering the rail</h3>
            </div>
            <Badge tone={dangerCount ? 'rose' : 'amber'}>{wiring.warnings.length} item{wiring.warnings.length === 1 ? '' : 's'}</Badge>
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {wiring.warnings.map((warning) => (
              <li key={warning.id} className="flex gap-3 px-5 py-3.5">
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border',
                    warning.severity === 'danger'
                      ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
                      : warning.severity === 'warning'
                        ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
                        : 'border-sky-400/25 bg-sky-400/10 text-sky-300',
                  )}
                >
                  {warning.severity === 'danger' ? (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-100">{warning.title}</p>
                    <Badge tone={severityTone[warning.severity]}>{warning.severity}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{warning.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Pin matrix</p>
              <h3 className="mt-1 text-base font-semibold text-white">Board ↔ module map</h3>
            </div>
            <CircuitBoard className="h-4 w-4 text-slate-500" />
          </div>
          <WiringDiagram board={board} wiring={wiring} />
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Power budget</p>
              <Gauge className="h-4 w-4 text-slate-500" />
            </div>
            {wiring.powerRails.length === 0 ? (
              <p className="muted mt-3">No powered modules on the plan.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {wiring.powerRails.map((rail) => {
                  const ratio = rail.capacityMa > 0 ? rail.currentMa / rail.capacityMa : 0
                  const tone = ratio > 1 ? 'rose' : ratio > 0.8 ? 'amber' : 'mint'
                  return (
                    <div key={rail.rail}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-200">
                          {rail.rail} <span className="font-mono text-[10px] text-slate-500">{rail.voltage} V</span>
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {rail.currentMa} / {rail.capacityMa} mA
                        </p>
                      </div>
                      <div className="mt-2">
                        <ProgressBar value={Math.round(ratio * 100)} tone={tone} label={`${rail.rail} load`} />
                      </div>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-600">
                        {Math.round(ratio * 100)}% continuous estimate
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="mt-4 text-[10px] leading-relaxed text-slate-600">
              Typical currents only. Radio, motor and servo peaks are higher — leave at least 20% headroom.
            </p>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Unconnected</p>
              <Unplug className="h-4 w-4 text-slate-500" />
            </div>
            {wiring.unconnected.length === 0 ? (
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-mint-200/80">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-400" />
                Every required pin in the selected modules found a compatible board pin.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {wiring.unconnected.map((item) => (
                  <li key={`${item.componentLabel}-${item.pinLabel}`} className="rounded-lg border border-rose-400/15 bg-rose-400/[0.05] px-3 py-2">
                    <p className="text-xs font-medium text-rose-100">
                      {item.componentLabel} · {item.pinLabel}
                    </p>
                    <p className="mt-0.5 text-[11px] text-rose-200/70">{item.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">AI review</p>
              <Bot className="h-4 w-4 text-slate-500" />
            </div>
            {reviewError ? (
              <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
                {reviewError}
              </p>
            ) : null}
            {review ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={review.source === 'cloud' ? 'mint' : 'sky'}>{review.source === 'cloud' ? 'AI + engine' : 'engine'}</Badge>
                  {review.model ? <span className="truncate font-mono text-[9px] uppercase tracking-wider text-slate-600">{review.model}</span> : null}
                </div>
                <p className="text-xs leading-relaxed text-slate-300">{review.summary}</p>
                {review.risks.length ? (
                  <div>
                    <p className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-amber-400">Risks</p>
                    <ul className="space-y-1.5">
                      {review.risks.slice(0, 6).map((risk) => (
                        <li key={risk} className="flex gap-1.5 text-[11px] leading-relaxed text-slate-400">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {review.checks.length ? (
                  <div>
                    <p className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-mint-400">Bench checks</p>
                    <ul className="space-y-1.5">
                      {review.checks.slice(0, 6).map((check) => (
                        <li key={check} className="flex gap-1.5 text-[11px] leading-relaxed text-slate-400">
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-mint-400" />
                          {check}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {review.note ? <p className="text-[10px] leading-relaxed text-slate-600">{review.note}</p> : null}
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs leading-relaxed text-slate-400">
                  Ask the configured AI to sanity-check voltage, current, grounding and bus conflicts. It sees the exact
                  plan below and cannot change your pin assignments.
                </p>
                <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => void handleReview()} disabled={reviewBusy}>
                  {reviewBusy ? <Spinner /> : <Bot className="h-3.5 w-3.5 text-mint-300" />}
                  {reviewBusy ? 'Reviewing…' : 'Request safety review'}
                </Button>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
            <div>
              <p className="eyebrow">Wiring guide in words</p>
              <h3 className="mt-1 text-base font-semibold text-white">One module at a time</h3>
            </div>
            <Badge tone="mint">
              <Cable className="h-3 w-3" />
              {wiring.stats.connections} wires
            </Badge>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {wiring.guides.map((guide) => {
              const def = getComponent(guide.componentId, customComponents)
              return (
                <article key={guide.instanceId} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-white">{guide.componentLabel}</h4>
                    {def ? <Badge tone="slate">{def.category}</Badge> : null}
                    {def?.requiresExternalSupply ? <Badge tone="amber">external supply</Badge> : null}
                  </div>
                  <ol className="mt-3 space-y-1.5">
                    {guide.connections.map((connection) => (
                      <li
                        key={connection.id}
                        className="flex flex-col gap-1 rounded-lg border border-white/[0.05] bg-ink-900/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: connectionColor(connection) }}
                          />
                          <span className="truncate text-xs text-slate-300">{connection.componentPinLabel}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-slate-600" />
                          <span className="truncate font-mono text-xs text-mint-200">
                            {connection.boardPinLabel} <span className="text-slate-500">({connection.boardPinCode})</span>
                          </span>
                        </span>
                        <Badge
                tone={
                  connection.net === 'ground'
                    ? 'slate'
                    : connection.net === 'power-5v'
                      ? 'rose'
                      : connection.net === 'power-dc'
                        ? 'orange'
                        : connection.net === 'power-3v3'
                          ? 'amber'
                          : 'sky'
                }
              >
                          {connection.netLabel}
                        </Badge>
                        {connection.note ? (
                          <p className="w-full text-[10px] leading-relaxed text-slate-500 sm:w-auto sm:max-w-[42%] sm:text-right">
                            {connection.note}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {guide.safety.length ? (
                    <ul className="mt-3 space-y-1.5">
                      {guide.safety.slice(0, 3).map((item) => (
                        <li key={item} className="flex gap-1.5 text-[11px] leading-relaxed text-amber-100/70">
                          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/80" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              )
            })}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
            <div>
              <p className="eyebrow">Pin usage</p>
              <h3 className="mt-1 text-base font-semibold text-white">Every occupied pin</h3>
            </div>
            <ListChecks className="h-4 w-4 text-slate-500" />
          </div>
          <div className="max-h-[30rem] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur">
                <tr className="border-b border-white/[0.07] font-mono text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 font-medium">Board pin</th>
                  <th className="px-3 py-2.5 font-medium">Nets</th>
                  <th className="px-5 py-2.5 font-medium">Modules</th>
                </tr>
              </thead>
              <tbody>
                {wiring.pinUsage.map((usage) => (
                  <tr key={usage.boardPinId} className="border-b border-white/[0.04] last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <span className="text-slate-200">{usage.label}</span>
                      <span className="ml-1.5 font-mono text-[10px] text-slate-500">
                        {usage.kind === 'power' ? 'PWR' : usage.kind === 'ground' ? 'GND' : 'GPIO'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {usage.nets.slice(0, 3).map((net) => (
                          <Badge key={net} tone={net === 'GND' ? 'slate' : net.includes('5') ? 'rose' : net.includes('3.3') ? 'amber' : net.includes('V') ? 'orange' : 'sky'}>
                            {net}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-[11px] leading-relaxed text-slate-400">
                      {usage.componentLabels.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/[0.07] px-5 py-3">
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-600">
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              Shared I2C and SPI buses intentionally reuse the same board pins. Chip-select lines are always unique.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
