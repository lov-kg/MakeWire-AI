import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Clock3,
  Copy,
  Cpu,
  Download,
  FileCode2,
  History,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wand2,
} from 'lucide-react'
import type {
  Board,
  ComponentDefinition,
  GeneratedCode,
  Project,
  TargetFramework,
  WiringPlan,
} from '../types'
import { frameworkLabel, generateLocalCode, resolveFramework } from '../lib/codegen'
import { buildCodeRequest, requestGeneratedCode } from '../lib/ai'
import { copyToClipboard, downloadText, formatDate, uid } from '../lib/utils'
import { Badge, Button, EmptyState, Panel, SectionHeading, Spinner } from './ui'
import { CodeBlock } from './CodeBlock'
import { cn } from '../lib/utils'

const frameworkOptions: Array<{ id: TargetFramework; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'Board-native' },
  { id: 'arduino', label: 'Arduino', hint: 'C++ / .ino' },
  { id: 'micropython', label: 'MicroPython', hint: '.py' },
  { id: 'esp-idf', label: 'ESP-IDF', hint: 'native C++' },
  { id: 'python', label: 'Python SBC', hint: 'Linux / .py' },
  { id: 'structured-text', label: 'PLC ST', hint: 'IEC 61131-3' },
]

const suggestions = [
  'Read temperature and humidity every 10 seconds and print to Serial.',
  'Show live sensor readings on the OLED.',
  'Control the relay from a Wi-Fi web page.',
  'Log every sensor reading to the microSD card.',
  'Sound the buzzer when the ultrasonic distance drops below 20 cm.',
]

export function CodeStudio({
  board,
  project,
  customComponents,
  wiring,
  onPromptChange,
  onFrameworkChange,
  onAddCode,
  onSelectCode,
  onGoWiring,
  onGoComponents,
  onNotify,
}: {
  board: Board
  project: Project
  customComponents: ComponentDefinition[]
  wiring: WiringPlan
  onPromptChange: (value: string) => void
  onFrameworkChange: (value: TargetFramework) => void
  onAddCode: (code: GeneratedCode) => void
  onSelectCode: (id: string) => void
  onGoWiring: () => void
  onGoComponents: () => void
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const [busy, setBusy] = useState<'local' | 'cloud' | null>(null)
  const [useCloud, setUseCloud] = useState(() => {
    try {
      return window.localStorage.getItem('makerwire:use-cloud') !== '0'
    } catch {
      return true
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const activeCode = useMemo(
    () =>
      project.codeHistory.find((item) => item.id === project.activeCodeId) ??
      project.codeHistory[0] ??
      null,
    [project.codeHistory, project.activeCodeId],
  )
  const resolved = resolveFramework(project.framework, board)

  const toggleCloud = () => {
    const next = !useCloud
    setUseCloud(next)
    try {
      window.localStorage.setItem('makerwire:use-cloud', next ? '1' : '0')
    } catch {
      // Storage may be disabled — the toggle still works for this session.
    }
  }

  const handleGenerate = async () => {
    if (!project.prompt.trim()) {
      setError('Describe what the circuit should do first.')
      return
    }
    if (wiring.connections.length === 0) {
      setError('Add at least one component and generate a wiring plan before writing firmware.')
      return
    }

    setError(null)
    setInfo(null)
    setBusy('local')

    const local = generateLocalCode({
      board,
      projectComponents: project.components,
      customComponents,
      wiring,
      prompt: project.prompt,
      framework: project.framework,
    })
    onAddCode(local)
    setInfo(`Local ${frameworkLabel(local.framework)} sketch generated from the exact wiring map.`)

    if (useCloud) {
      setBusy('cloud')
      const request = buildCodeRequest(
        board.id,
        project.components,
        customComponents,
        wiring,
        project.prompt,
        project.framework,
        local.code,
      )
      if (request) {
        try {
          const response = await requestGeneratedCode(request)
          const cloudCode: GeneratedCode = {
            id: uid('code'),
            title: response.title || local.title,
            prompt: project.prompt,
            framework: response.framework ?? local.framework,
            source: 'cloud',
            code: response.code,
            filename: response.filename,
            explanation: response.explanation,
            libraries: response.libraries,
            createdAt: new Date().toISOString(),
          }
          onAddCode(cloudCode)
          setInfo(response.note || 'Cloud AI enhancement applied. Review it before flashing.')
        } catch (cloudError) {
          setError(
            `${cloudError instanceof Error ? cloudError.message : 'AI enhancement failed.'} The local pin-correct sketch is still in your history.`,
          )
        }
      }
    }

    setBusy(null)
  }

  const handleCopy = async () => {
    if (!activeCode) return
    try {
      await copyToClipboard(activeCode.code)
      onNotify('Sketch copied to clipboard.', 'success')
    } catch {
      onNotify('Clipboard access was blocked by the browser.', 'error')
    }
  }

  const handleDownload = () => {
    if (!activeCode) return
    const type =
      activeCode.framework === 'micropython' || activeCode.framework === 'python'
        ? 'text/x-python'
        : activeCode.framework === 'structured-text'
          ? 'text/plain'
          : 'text/x-c++src'
    downloadText(activeCode.filename, activeCode.code, type)
    onNotify(`${activeCode.filename} downloaded.`, 'success')
  }

  if (project.components.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeading eyebrow="Step 04 · firmware" title="Code needs a circuit" />
        <EmptyState
          icon={<Cpu className="h-5 w-5" />}
          title="Add components first"
          description="MakerWire generates code from your actual pin map, never from a generic template. Add modules and return here."
          action={
            <Button variant="primary" onClick={onGoComponents}>
              Open component library
              <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Step 04 · firmware"
        title="Describe the behaviour. Keep the wiring."
        description="The local engine writes a complete sketch with your exact GPIOs. Cloud AI can refine it, but it is never allowed to change the pin map."
        actions={
          <Button variant="secondary" onClick={onGoWiring}>
            Review wiring
            <ArrowRight className="h-4 w-4" />
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="code-prompt" className="eyebrow">
              Project behaviour
            </label>
            <Badge tone={wiring.status === 'ready' ? 'mint' : wiring.status === 'attention' ? 'amber' : 'rose'}>
              {wiring.stats.connections} connections
            </Badge>
          </div>
          <textarea
            id="code-prompt"
            value={project.prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="field mt-3 min-h-36 resize-y font-sans text-sm leading-relaxed"
            placeholder="Example: Read the DHT22 every 10 seconds, show it on the OLED, and turn on the relay above 30 °C."
            maxLength={2000}
          />
          <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-wider text-slate-600">
            <span>{project.prompt.length}/2000</span>
            <span>intervals are parsed from your prompt</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onPromptChange(suggestion)}
                className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-left text-[10px] leading-snug text-slate-400 transition hover:border-mint-400/25 hover:bg-mint-400/[0.06] hover:text-mint-200"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <p className="label">Framework</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {frameworkOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onFrameworkChange(option.id)}
                  aria-pressed={project.framework === option.id}
                  className={cn(
                    'rounded-xl border px-2.5 py-2 text-left transition',
                    project.framework === option.id
                      ? 'border-mint-400/30 bg-mint-400/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                  )}
                >
                  <span className={cn('block text-xs font-semibold', project.framework === option.id ? 'text-mint-200' : 'text-slate-300')}>
                    {option.label}
                  </span>
                  <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-slate-600">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Effective target: <span className="font-mono text-slate-300">{frameworkLabel(resolved)}</span>
              {resolved !== project.framework && project.framework !== 'auto'
                ? ' — this board does not support the requested target, so the engine falls back safely.'
                : ''}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              role="switch"
              aria-checked={useCloud}
              onClick={toggleCloud}
              className="flex items-center gap-2 self-start rounded-lg text-left text-[11px] text-slate-400 transition hover:text-slate-200"
            >
              <span
                className={cn(
                  'relative h-5 w-9 rounded-full border transition',
                  useCloud ? 'border-mint-400/30 bg-mint-400/20' : 'border-white/15 bg-white/[0.06]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-3.5 w-3.5 rounded-full transition',
                    useCloud ? 'left-[1.15rem] bg-mint-300' : 'left-0.5 bg-slate-500',
                  )}
                />
              </span>
              Cloud AI enhancement
              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
                {useCloud ? 'on' : 'off'}
              </span>
            </button>

            <Button variant="primary" onClick={() => void handleGenerate()} disabled={busy !== null}>
              {busy ? <Spinner /> : <Wand2 className="h-4 w-4" />}
              {busy === 'local' ? 'Generating…' : busy === 'cloud' ? 'Refining with AI…' : 'Generate firmware'}
            </Button>
          </div>

          <div className="mt-3 min-h-5" aria-live="polite">
            {error ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200/90">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {error}
              </p>
            ) : info ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-mint-200/80">
                <Check className="mt-0.5 h-3 w-3 shrink-0" />
                {info}
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-600">
                Without a cloud key everything still runs locally. Placeholders are emitted for Wi-Fi credentials.
              </p>
            )}
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Build context</p>
            <ShieldCheck className="h-4 w-4 text-mint-400" />
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{board.name}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {board.chip} · {board.logicVoltage} V logic · {board.code.adcBits}-bit ADC
          </p>

          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2">
              <dt className="text-slate-500">Modules</dt>
              <dd className="font-mono text-slate-200">{wiring.stats.components}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2">
              <dt className="text-slate-500">Signals</dt>
              <dd className="font-mono text-slate-200">{wiring.stats.signals}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2">
              <dt className="text-slate-500">Warnings</dt>
              <dd className="font-mono text-slate-200">{wiring.warnings.length}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Sketch history</dt>
              <dd className="font-mono text-slate-200">{project.codeHistory.length}</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.05] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
              <Lightbulb className="h-3 w-3" />
              Tip for better output
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-sky-100/70">
              Name the behaviour and the interval: “read every 5 seconds”, “turn the relay on above 30 °C”, “serve a
              status page”. The engine maps those intents onto the modules you actually added.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1">
            {wiring.warnings.slice(0, 4).map((warning) => (
              <Badge key={warning.id} tone={warning.severity === 'danger' ? 'rose' : warning.severity === 'warning' ? 'amber' : 'sky'}>
                {warning.severity}
              </Badge>
            ))}
            {wiring.warnings.length === 0 ? <Badge tone="mint">no safety flags</Badge> : null}
          </div>
        </Panel>
      </div>

      {activeCode ? (
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-white">{activeCode.title}</h2>
                <Badge tone={activeCode.source === 'cloud' ? 'mint' : 'sky'}>
                  {activeCode.source === 'cloud' ? (
                    <>
                      <Sparkles className="h-3 w-3" /> AI enhanced
                    </>
                  ) : (
                    <>
                      <Terminal className="h-3 w-3" /> local engine
                    </>
                  )}
                </Badge>
                <Badge tone="slate">{frameworkLabel(activeCode.framework)}</Badge>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                <span className="flex items-center gap-1">
                  <FileCode2 className="h-3 w-3" />
                  {activeCode.filename}
                </span>
                <span className="flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  {formatDate(activeCode.createdAt)}
                </span>
                <span>{activeCode.code.split('\n').length} lines</span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button size="sm" variant="primary" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>

          <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <CodeBlock code={activeCode.code} language={activeCode.framework} />
            </div>
            <div className="space-y-4">
              <div>
                <p className="eyebrow">How it was built</p>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-400">{activeCode.explanation}</p>
              </div>
              <div>
                <p className="eyebrow">Libraries / drivers</p>
                {activeCode.libraries.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeCode.libraries.map((library) => (
                      <Badge key={library} tone="violet">
                        {library}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No external libraries detected.</p>
                )}
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-ink-900/50 p-3">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                  <ShieldCheck className="h-3 w-3 text-mint-400" />
                  Pin contract
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                  This sketch was generated from {wiring.stats.connections} verified connections. If you change the
                  wiring, regenerate the sketch instead of editing pin numbers by hand.
                </p>
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <EmptyState
          icon={<Bot className="h-5 w-5" />}
          title="No firmware in this project yet"
          description="Describe the behaviour above and generate. The first sketch is always produced locally, instantly, with your exact pin map."
        />
      )}

      {project.codeHistory.length > 0 ? (
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
            <div>
              <p className="eyebrow">Sketch history</p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {project.codeHistory.length} saved version{project.codeHistory.length === 1 ? '' : 's'}
              </h3>
            </div>
            <History className="h-4 w-4 text-slate-500" />
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {project.codeHistory.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectCode(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-white/[0.03]',
                    item.id === activeCode?.id && 'bg-mint-400/[0.05]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      item.source === 'cloud'
                        ? 'border-mint-400/25 bg-mint-400/10 text-mint-300'
                        : 'border-sky-400/20 bg-sky-400/10 text-sky-300',
                    )}
                  >
                    {item.source === 'cloud' ? <Sparkles className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-200">{item.title}</span>
                    <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
                      {frameworkLabel(item.framework)} · {item.source} · {formatDate(item.createdAt)}
                    </span>
                  </span>
                  {item.id === activeCode?.id ? (
                    <Check className="h-4 w-4 shrink-0 text-mint-400" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
