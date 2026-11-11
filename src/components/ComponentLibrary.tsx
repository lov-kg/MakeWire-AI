import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Boxes,
  Camera,
  Check,
  Cog,
  HardDrive,
  Layers,
  Minus,
  Monitor,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Trash2,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { allComponents, componentCategories, componentSearchText, getComponent } from '../catalog/registry'
import type { ComponentDefinition, LifecycleStatus, ProjectComponent } from '../types'
import { lookupComponent, makeCustomComponent } from '../lib/ai'
import { Badge, Button, EmptyState, IconButton, Modal, Panel, SectionHeading, Spinner } from './ui'
import { cn } from '../lib/utils'

const categoryIcon = (category: string) => {
  if (category === 'Sensors') return Thermometer
  if (category === 'Displays') return Monitor
  if (category === 'Actuators') return Cog
  if (category === 'Connectivity') return Radio
  if (category === 'Storage') return HardDrive
  if (category === 'Inputs') return SlidersHorizontal
  if (category === 'Cameras') return Camera
  return Boxes
}

const lifecycleCopy: Record<LifecycleStatus, string> = {
  active: 'Active',
  preview: 'Preview',
  nrnd: 'NRND',
  obsolete: 'Obsolete',
  unknown: 'Unverified',
}

export function ComponentLibrary({
  components,
  customComponents,
  onAdd,
  onRemove,
  onQuantity,
  onPower,
  onCustomComponent,
  onContinue,
  onNotify,
}: {
  components: ProjectComponent[]
  customComponents: ComponentDefinition[]
  onAdd: (componentId: string) => void
  onRemove: (instanceId: string) => void
  onQuantity: (instanceId: string, quantity: number) => void
  onPower: (instanceId: string, power: ProjectComponent['powerOverride']) => void
  onCustomComponent: (component: ComponentDefinition) => void
  onContinue: () => void
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [industrialOnly, setIndustrialOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const catalog = allComponents()
  const categories = componentCategories()
  const all = useMemo(() => [...catalog, ...customComponents], [catalog, customComponents])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesIndustrial = !industrialOnly || item.industrial
      const matchesQuery = !needle || componentSearchText(item).includes(needle)
      return matchesCategory && matchesIndustrial && matchesQuery
    })
  }, [all, query, category, industrialOnly])

  const resolved = components
    .map((item) => ({ item, def: getComponent(item.componentId, customComponents) }))
    .filter((entry): entry is { item: ProjectComponent; def: ComponentDefinition } => Boolean(entry.def))

  const counts = new Map<string, number>()
  for (const item of components) counts.set(item.componentId, (counts.get(item.componentId) ?? 0) + item.quantity)

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Step 02 · modules"
        title="Build your parts list"
        description="Search the local library or ask AI for a module that is not listed. Quantities and power overrides feed the pin engine and the power budget."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              <Sparkles className="h-4 w-4 text-mint-300" />
              Custom / AI lookup
            </Button>
            <Button variant="primary" onClick={onContinue} disabled={components.length === 0}>
              Wiring guide
              <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel className="p-4">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="field pl-9"
                  placeholder="Search sensors, displays, LTE, motors, cameras…"
                  aria-label="Search components"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setIndustrialOnly((value) => !value)}
                  aria-pressed={industrialOnly}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition',
                    industrialOnly
                      ? 'border-orange-400/40 bg-orange-400/10 text-orange-200'
                      : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300',
                  )}
                >
                  Industrial
                </button>
                {['All', ...categories, ...customComponents
                  .map((item) => item.category)
                  .filter((item, index, list) => !categories.includes(item) && list.indexOf(item) === index)]
                  .filter((item, index, list) => list.indexOf(item) === index)
                  .map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition',
                      category === item
                        ? 'border-mint-400/30 bg-mint-400/10 text-mint-300'
                        : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Boxes className="h-5 w-5" />}
              title="No modules matched"
              description="Try a different search, or add the exact breakout with the AI lookup or the manual form."
              action={<Button onClick={() => setModalOpen(true)}>Add a custom module</Button>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((component) => {
                const Icon = categoryIcon(component.category)
                const count = counts.get(component.id) ?? 0
                return (
                  <div key={component.id} className="panel group flex flex-col p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-mint-300">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug text-white">{component.shortName}</p>
                          {count > 0 ? <Badge tone="mint">×{count}</Badge> : null}
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          {component.category} · {component.manufacturer ?? 'generic'}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-400">{component.description}</p>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {component.interfaces.slice(0, 3).map((item) => (
                        <Badge key={item} tone="slate">
                          {item}
                        </Badge>
                      ))}
                      {(component.protocols ?? []).slice(0, 2).map((item) => (
                        <Badge key={item} tone="mint">
                          {item}
                        </Badge>
                      ))}
                      <Badge tone="amber">{component.voltage.typical} V</Badge>
                      <Badge tone="sky">{component.current.typicalMa} mA</Badge>
                      {component.outputVoltage && component.outputVoltage >= 12 ? (
                        <Badge tone="orange">{component.outputVoltage} V out</Badge>
                      ) : null}
                      {component.i2cAddress ? <Badge tone="violet">{component.i2cAddress}</Badge> : null}
                      {component.industrial ? <Badge tone="orange">Industrial</Badge> : null}
                      {component.lifecycle && component.lifecycle !== 'active' ? (
                        <Badge tone={component.lifecycle === 'obsolete' || component.lifecycle === 'nrnd' ? 'rose' : 'amber'}>
                          {lifecycleCopy[component.lifecycle]}
                        </Badge>
                      ) : null}
                    </div>

                    {component.requiresExternalSupply || component.outputs5v || (component.outputVoltage ?? 0) >= 12 ? (
                      <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-2.5 py-2 text-[10px] leading-relaxed text-amber-200/80">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                        {component.requiresExternalSupply
                          ? `Needs an external ${component.outputVoltage && component.outputVoltage >= 12 ? `${component.outputVoltage} V ` : ''}supply — do not power from the logic rail.`
                          : (component.outputVoltage ?? 0) >= 12
                            ? `Switched output is ${component.outputVoltage} V. Keep it isolated from logic.`
                            : 'Drives 5 V outputs — level shift on 3.3 V boards.'}
                      </div>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
                        {component.pins.length} pins · {component.pack ?? 'core'}
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => onAdd(component.id)}>
                        <Plus className="h-3.5 w-3.5" />
                        Add to project
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2 className="mt-1 text-base font-semibold text-white">
                  {resolved.length ? `${resolved.length} module${resolved.length === 1 ? '' : 's'}` : 'Empty bench'}
                </h2>
              </div>
              <Layers className="h-4 w-4 text-slate-500" />
            </div>

            {resolved.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-300">Nothing on the bench yet</p>
                <p className="muted mt-2">Add a sensor or display to start the wiring engine.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {resolved.map(({ item, def }) => (
                  <li key={item.instanceId} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{def.shortName}</p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          {def.category} · {def.pins.length} pins
                        </p>
                      </div>
                      <IconButton
                        label={`Remove ${def.shortName}`}
                        className="h-7 w-7 border-transparent bg-transparent text-slate-500 hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-300"
                        onClick={() => onRemove(item.instanceId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <span className="mb-1 block text-[9px] uppercase tracking-[0.18em] text-slate-600">Qty</span>
                        <div className="flex h-8 items-center justify-between rounded-lg border border-white/10 bg-ink-950/60">
                          <button
                            type="button"
                            aria-label={`Decrease ${def.shortName} quantity`}
                            className="flex h-full w-8 items-center justify-center text-slate-400 hover:text-white disabled:opacity-30"
                            disabled={item.quantity <= 1}
                            onClick={() => onQuantity(item.instanceId, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-xs text-slate-100">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${def.shortName} quantity`}
                            className="flex h-full w-8 items-center justify-center text-slate-400 hover:text-white disabled:opacity-30"
                            disabled={item.quantity >= 20}
                            onClick={() => onQuantity(item.instanceId, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor={`power-${item.instanceId}`}
                          className="mb-1 block text-[9px] uppercase tracking-[0.18em] text-slate-600"
                        >
                          Power
                        </label>
                        <select
                          id={`power-${item.instanceId}`}
                          value={item.powerOverride}
                          onChange={(event) =>
                            onPower(item.instanceId, event.target.value as ProjectComponent['powerOverride'])
                          }
                          className="h-8 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 font-mono text-[11px] text-slate-200 focus:border-mint-400/50 focus:outline-none"
                        >
                          <option value="auto">Auto</option>
                          <option value="3.3">Force 3.3 V</option>
                          <option value="5">Force 5 V</option>
                          <option value="12">Force 12 V</option>
                          <option value="24">Force 24 V</option>
                          <option value="48">Force 48 V</option>
                        </select>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-white/[0.07] p-4">
              <Button
                variant="primary"
                className="w-full"
                disabled={resolved.length === 0}
                onClick={onContinue}
              >
                Generate wiring guide
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-wider text-slate-600">
                auto-runs offline in your browser
              </p>
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="eyebrow">Quantity tip</p>
            <p className="muted mt-2">
              Add the same module twice to place two instances. I2C devices that share a fixed address will raise a
              collision warning in the wiring step.
            </p>
          </Panel>
        </div>
      </div>

      <CustomComponentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={(component) => {
          onCustomComponent(component)
          setModalOpen(false)
          onNotify(`${component.shortName} added to the workspace.`, 'success')
        }}
        onNotify={onNotify}
      />
    </div>
  )
}

function CustomComponentModal({
  open,
  onClose,
  onAdd,
  onNotify,
}: {
  open: boolean
  onClose: () => void
  onAdd: (component: ComponentDefinition) => void
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const [tab, setTab] = useState<'ai' | 'manual'>('ai')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ComponentDefinition | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('Custom')
  const [voltage, setVoltage] = useState('3.3')
  const [pins, setPins] = useState('VCC:power\nGND:ground\nSIG:digital')

  const reset = () => {
    setQuery('')
    setError(null)
    setResult(null)
    setNote(null)
    setName('')
    setCategory('Custom')
    setVoltage('3.3')
    setPins('VCC:power\nGND:ground\nSIG:digital')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleLookup = async () => {
    if (query.trim().length < 2) {
      setError('Enter at least two characters, for example “BME680” or “PCA9685”.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    setNote(null)
    try {
      const response = await lookupComponent(query.trim())
      if (response.component) {
        setResult(response.component)
        setNote(response.note ?? null)
      } else {
        setNote(response.note ?? 'No reliable match found. Try a more specific breakout name or use the manual form.')
      }
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : 'The lookup service is unavailable. Use the manual form instead.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleManual = () => {
    if (!name.trim()) {
      setError('Give the module a name.')
      return
    }
    if (!pins.trim()) {
      setError('Add at least one pin using the label:role format.')
      return
    }
    const component = makeCustomComponent({
      name,
      category,
      voltage: Number(voltage) || 3.3,
      pins,
    })
    reset()
    onAdd(component)
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add a module not in the library"
      description="Ask AI to map a real breakout, or define the pins yourself. Custom modules stay in this browser."
      size="lg"
    >
      <div className="mb-5 flex rounded-xl border border-white/10 bg-ink-950/60 p-1">
        <button
          type="button"
          onClick={() => setTab('ai')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition',
            tab === 'ai' ? 'bg-mint-400/10 text-mint-200' : 'text-slate-500 hover:text-slate-300',
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          AI lookup
        </button>
        <button
          type="button"
          onClick={() => setTab('manual')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition',
            tab === 'manual' ? 'bg-mint-400/10 text-mint-200' : 'text-slate-500 hover:text-slate-300',
          )}
        >
          <Wrench className="h-3.5 w-3.5" />
          Manual pin map
        </button>
      </div>

      {tab === 'ai' ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="lookup-query" className="label">
              Module name
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="lookup-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleLookup()
                }}
                className="field"
                placeholder="e.g. BME680 breakout, PCA9685 PWM driver, SIM800L"
              />
              <Button variant="primary" onClick={() => void handleLookup()} disabled={busy} className="shrink-0">
                {busy ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                {busy ? 'Looking up…' : 'Look up'}
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              AI returns voltage, current, bus and pin roles. Always verify the result against the datasheet before
              powering the module.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2.5 text-xs leading-relaxed text-rose-200">
              {error}
            </div>
          ) : null}

          {note ? (
            <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-3 py-2.5 text-xs leading-relaxed text-sky-100/80">
              {note}
            </div>
          ) : null}

          {result ? (
            <div className="panel-inset p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">{result.name}</p>
                <Badge tone="mint">AI mapped</Badge>
              </div>
              <p className="muted mt-2">{result.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                <Badge tone="amber">{result.voltage.typical} V</Badge>
                <Badge tone="sky">{result.current.typicalMa} mA</Badge>
                {result.interfaces.map((item) => (
                  <Badge key={item} tone="slate">
                    {item}
                  </Badge>
                ))}
                {result.i2cAddress ? <Badge tone="violet">{result.i2cAddress}</Badge> : null}
              </div>
              <div className="mt-3 rounded-lg border border-white/[0.06] bg-ink-950/60 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Pin map</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {result.pins.map((pin) => (
                    <p key={pin.id} className="font-mono text-[11px] text-slate-300">
                      {pin.label} <span className="text-slate-600">→</span> {pin.role}
                    </p>
                  ))}
                </div>
              </div>
              <Button variant="primary" className="mt-4 w-full" onClick={() => onAdd(result)}>
                <Check className="h-4 w-4" />
                Add to library and workspace
              </Button>
            </div>
          ) : null}

          {!result && !busy ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-slate-600">
              The lookup appears here. No AI key? Switch to the manual pin map.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="custom-name" className="label">
                Module name
              </label>
              <input
                id="custom-name"
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. 8-channel level shifter"
              />
            </div>
            <div>
              <label htmlFor="custom-category" className="label">
                Category
              </label>
              <input
                id="custom-category"
                className="field"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Custom"
              />
            </div>
          </div>
          <div>
            <label htmlFor="custom-voltage" className="label">
              Typical supply voltage (V)
            </label>
            <input
              id="custom-voltage"
              type="number"
              step="0.1"
              min="1.8"
              max="24"
              className="field"
              value={voltage}
              onChange={(event) => setVoltage(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="custom-pins" className="label">
              Pins — one per line as <span className="font-mono normal-case">label:role</span>
            </label>
            <textarea
              id="custom-pins"
              className="field min-h-32 font-mono text-xs"
              value={pins}
              onChange={(event) => setPins(event.target.value)}
              spellCheck={false}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Roles: power, ground, i2c-sda, i2c-scl, spi-sck, spi-mosi, spi-miso, spi-cs, uart-tx, uart-rx, analog,
              digital, pwm, onewire, nc.
            </p>
          </div>
          {error ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          ) : null}
          <Button variant="primary" className="w-full" onClick={handleManual}>
            <Plus className="h-4 w-4" />
            Create and add to workspace
          </Button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            The manual power/ground requirement is added automatically if you omit it. Unknown roles become GPIO.
          </p>
        </div>
      )}
    </Modal>
  )
}
