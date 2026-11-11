import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Search,
  SearchX,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { allBoards, boardGroups, boardSearchText } from '../catalog/registry'
import type { Board, LifecycleStatus, PinCapability } from '../types'
import { Badge, Button, EmptyState, Panel, SectionHeading, StatCard } from './ui'
import { cn } from '../lib/utils'

const capabilityLabel: Record<PinCapability, string> = {
  gpio: 'GPIO',
  adc: 'ADC',
  dac: 'DAC',
  pwm: 'PWM',
  'i2c-sda': 'SDA',
  'i2c-scl': 'SCL',
  'spi-sck': 'SCK',
  'spi-mosi': 'MOSI',
  'spi-miso': 'MISO',
  'spi-cs': 'CS',
  'uart-tx': 'TX',
  'uart-rx': 'RX',
  'can-tx': 'CAN TX',
  'can-rx': 'CAN RX',
  'can-h': 'CAN H',
  'can-l': 'CAN L',
  'rs485-a': '485 A',
  'rs485-b': '485 B',
  ethernet: 'ETH',
  'i2s-bclk': 'BCLK',
  'i2s-lrck': 'LRCK',
  'i2s-dout': 'DOUT',
  'i2s-din': 'DIN',
}

const lifecycleCopy: Record<LifecycleStatus, string> = {
  active: 'Active',
  preview: 'Preview',
  nrnd: 'NRND',
  obsolete: 'Obsolete',
  unknown: 'Unverified',
}

const capabilityTone = (cap: PinCapability): 'mint' | 'amber' | 'sky' | 'violet' | 'orange' | 'slate' => {
  if (cap === 'adc') return 'amber'
  if (cap === 'dac') return 'orange'
  if (cap === 'pwm') return 'sky'
  if (cap === 'i2c-sda' || cap === 'i2c-scl') return 'violet'
  if (cap.startsWith('spi-')) return 'sky'
  if (cap === 'uart-tx' || cap === 'uart-rx') return 'mint'
  if (cap.startsWith('can-') || cap.startsWith('rs485-')) return 'mint'
  if (cap === 'ethernet') return 'sky'
  if (cap.startsWith('i2s-')) return 'violet'
  return 'slate'
}

export function BoardSelector({
  selectedId,
  onSelect,
  onContinue,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
  onContinue: () => void
}) {
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('All')
  const [industrialOnly, setIndustrialOnly] = useState(false)
  const boards = allBoards()
  const groups = boardGroups()
  const board = boards.find((item) => item.id === selectedId) ?? null

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return boards.filter((item) => {
      const matchesFamily = family === 'All' || item.family === family
      const matchesIndustrial = !industrialOnly || item.industrial
      const matchesQuery = !needle || boardSearchText(item).includes(needle)
      return matchesFamily && matchesIndustrial && matchesQuery
    })
  }, [boards, query, family, industrialOnly])

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Step 01 · target"
        title="Choose the brain of your build"
        description="Pin maps, logic levels and code metadata drive everything downstream. Pick the exact board you have on the bench."
        actions={
          board ? (
            <Button variant="primary" onClick={onContinue}>
              Add components
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null
        }
      />

      <Panel className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field pl-9"
              placeholder="Search ESP32-S3, Pico, STM32, Wi-Fi…"
              aria-label="Search boards"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setIndustrialOnly((value) => !value)}
              aria-pressed={industrialOnly}
              className={cn(
                'rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition',
                industrialOnly
                  ? 'border-orange-400/40 bg-orange-400/10 text-orange-200'
                  : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300',
              )}
            >
              Industrial
            </button>
            {['All', ...groups].map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setFamily(group)}
                aria-pressed={family === group}
                className={cn(
                  'rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition',
                  family === group
                    ? 'border-mint-400/30 bg-mint-400/10 text-mint-300'
                    : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300',
                )}
              >
                {group}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-5 w-5" />}
          title="No boards matched"
          description="Try a chip name, a vendor or a feature like Wi-Fi, PSRAM or 5V."
          action={
            <Button
              onClick={() => {
                setQuery('')
                setFamily('All')
                setIndustrialOnly(false)
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <BoardCard key={item.id} board={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />
          ))}
        </div>
      )}

      {board ? <BoardDetail board={board} onContinue={onContinue} /> : null}
    </div>
  )
}

function BoardCard({ board, selected, onSelect }: { board: Board; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'panel group flex h-full flex-col p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-white/20',
        selected && 'border-mint-400/40 bg-mint-400/[0.06] shadow-glow',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: `${board.accent}44`,
              backgroundColor: `${board.accent}14`,
              color: board.accent,
            }}
          >
            <Cpu className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{board.shortName}</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {board.vendor} · {board.chip}
            </p>
          </div>
        </div>
        {selected ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-400 text-ink-950">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </div>

      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-400">{board.description}</p>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.06] pt-3 font-mono text-[10px]">
        <span className="flex items-center gap-1.5 text-slate-500">
          <Zap className="h-3 w-3 text-amber-400" />
          {board.logicVoltage} V logic
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <Gauge className="h-3 w-3 text-sky-400" />
          {board.gpioCount} GPIO
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <HardDrive className="h-3 w-3 text-violet-400" />
          {board.flash} flash
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <MemoryStick className="h-3 w-3 text-mint-400" />
          {board.ram}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {board.connectivity.slice(0, 3).map((item) => (
          <Badge key={item} tone="mint">
            {item}
          </Badge>
        ))}
        <Badge tone="slate">{board.family}</Badge>
        {board.industrial ? <Badge tone="orange">Industrial</Badge> : null}
        {board.lifecycle && board.lifecycle !== 'active' ? (
          <Badge tone={board.lifecycle === 'obsolete' || board.lifecycle === 'nrnd' ? 'rose' : 'amber'}>
            {lifecycleCopy[board.lifecycle]}
          </Badge>
        ) : null}
        {board.verified ? <Badge tone="mint">Verified</Badge> : null}
      </div>
    </button>
  )
}

function BoardDetail({ board, onContinue }: { board: Board; onContinue: () => void }) {
  const defaultI2C = [board.defaults.i2cSda, board.defaults.i2cScl]
    .map((id) => board.pins.find((pin) => pin.id === id))
    .filter(Boolean)
  const defaultUart = [board.defaults.uartTx, board.defaults.uartRx]
    .map((id) => board.pins.find((pin) => pin.id === id))
    .filter(Boolean)

  return (
    <div className="space-y-4 animate-fade-up">
      <Panel className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-white">{board.name}</h2>
              <Badge tone={board.logicVoltage === 3.3 ? 'amber' : 'rose'}>{board.logicVoltage} V logic</Badge>
              {board.dacChannels ? <Badge tone="violet">DAC ×{board.dacChannels}</Badge> : null}
              {board.industrial ? <Badge tone="orange">Industrial</Badge> : null}
              {board.lifecycle ? (
                <Badge tone={board.lifecycle === 'active' ? 'mint' : board.lifecycle === 'preview' ? 'amber' : 'rose'}>
                  {lifecycleCopy[board.lifecycle]}
                </Badge>
              ) : null}
            </div>
            <p className="muted mt-2 max-w-3xl">{board.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {board.interfaces.map((item) => (
                <Badge key={item} tone="slate">
                  {item}
                </Badge>
              ))}
              {(board.protocols ?? []).map((item) => (
                <Badge key={item} tone="mint">
                  {item}
                </Badge>
              ))}
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-slate-500">
              {board.formFactor ? (
                <div>
                  <dt className="inline text-slate-600">form </dt>
                  <dd className="inline text-slate-300">{board.formFactor}</dd>
                </div>
              ) : null}
              {board.operatingTempC ? (
                <div>
                  <dt className="inline text-slate-600">temp </dt>
                  <dd className="inline text-slate-300">
                    {board.operatingTempC[0]}…{board.operatingTempC[1]} °C
                  </dd>
                </div>
              ) : null}
              {board.ingressProtection ? (
                <div>
                  <dt className="inline text-slate-600">IP </dt>
                  <dd className="inline text-slate-300">{board.ingressProtection}</dd>
                </div>
              ) : null}
              {board.standards?.length ? (
                <div>
                  <dt className="inline text-slate-600">std </dt>
                  <dd className="inline text-slate-300">{board.standards.join(' · ')}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <Button variant="primary" onClick={onContinue} className="shrink-0">
            Use this board
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="GPIO" value={board.gpioCount} hint={`${board.adcChannels} ADC channels`} icon={<Gauge className="h-3.5 w-3.5" />} tone="sky" />
          <StatCard label="Flash" value={board.flash} hint={board.formFactor} icon={<HardDrive className="h-3.5 w-3.5" />} tone="violet" />
          <StatCard label="RAM" value={board.ram} hint={board.clock} icon={<MemoryStick className="h-3.5 w-3.5" />} tone="mint" />
          <StatCard label="Input" value={board.inputVoltage} hint="Check polarity before power" icon={<Zap className="h-3.5 w-3.5" />} tone="amber" />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
            <div>
              <p className="eyebrow">Pin map</p>
              <h3 className="mt-1 text-base font-semibold text-white">{board.pins.length} exposed GPIOs</h3>
            </div>
            <Badge tone={board.verified ? 'mint' : 'amber'}>
              <ShieldCheck className="h-3 w-3" />
              {board.verified ? 'verified map' : 'datasheet review'}
            </Badge>
          </div>
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur">
                <tr className="border-b border-white/[0.07] font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 font-medium">Label</th>
                  <th className="px-3 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">Capabilities</th>
                  <th className="hidden px-5 py-2.5 font-medium md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {board.pins.map((pin) => (
                  <tr key={pin.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-200">{pin.label}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-mint-300">{pin.pinCode}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {pin.caps.slice(0, 4).map((cap) => (
                          <Badge key={cap} tone={capabilityTone(cap)}>
                            {capabilityLabel[cap]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="hidden px-5 py-2.5 text-slate-500 md:table-cell">
                      {pin.inputOnly ? <span className="text-amber-400">Input only · </span> : null}
                      {pin.restricted ? <span className="text-rose-400">Reserved · </span> : null}
                      {pin.note ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <p className="eyebrow">Power rails</p>
            <div className="mt-3 space-y-2">
              {board.powerPins.map((pin) => (
                <div key={pin.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 px-3 py-2.5">
                  <div>
                    <p className="font-mono text-xs font-semibold text-white">{pin.label}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{pin.note ?? (pin.voltage === 0 ? 'Common ground' : 'Board regulator output')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-amber-300">{pin.voltage === 0 ? 'GND' : `${pin.voltage} V`}</p>
                    {pin.maxCurrentMa > 0 ? (
                      <p className="font-mono text-[10px] text-slate-500">{pin.maxCurrentMa} mA</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Default buses</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3 border-b border-white/[0.05] pb-2">
                <dt className="text-slate-500">I2C</dt>
                <dd className="font-mono text-slate-200">
                  {defaultI2C.length ? defaultI2C.map((pin) => `${pin?.label} (${pin?.pinCode})`).join(' · ') : 'Not fixed'}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.05] pb-2">
                <dt className="text-slate-500">UART</dt>
                <dd className="font-mono text-slate-200">
                  {defaultUart.length ? defaultUart.map((pin) => `${pin?.label} (${pin?.pinCode})`).join(' · ') : 'Not fixed'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">SPI</dt>
                <dd className="font-mono text-slate-200">
                  {[board.defaults.spiSck, board.defaults.spiMosi, board.defaults.spiMiso]
                    .map((id) => board.pins.find((pin) => pin.id === id)?.pinCode)
                    .filter(Boolean)
                    .join(' · ') || 'Not fixed'}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Bench notes</p>
            <ul className="mt-3 space-y-2">
              {board.notes.map((note) => (
                <li key={note} className="flex gap-2 text-xs leading-relaxed text-slate-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mint-400" />
                  {note}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {board.bestFor.map((item) => (
                <Badge key={item} tone="slate">
                  {item}
                </Badge>
              ))}
            </div>
            {board.datasheetUrl ? (
              <a
                href={board.datasheetUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider text-mint-300 underline-offset-4 hover:underline"
              >
                Open vendor datasheet ↗
              </a>
            ) : null}
            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
              Catalogue pack: {board.pack ?? 'core'}. Generated industrial entries are marked for datasheet review; always confirm
              pinout, logic levels and current limits against the vendor document before powering hardware.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
