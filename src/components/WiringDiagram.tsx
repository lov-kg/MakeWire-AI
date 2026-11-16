import type { Board, NetKind, WiringPlan } from '../types'
import { connectionColor } from '../lib/wiring'
import { netColor } from '../lib/utils'
import { EmptyState } from './ui'
import { Cable } from 'lucide-react'

const netLabel: Record<NetKind, string> = {
  'power-3v3': '3.3 V',
  'power-5v': '5 V',
  'power-dc': 'DC',
  ground: 'GND',
  i2c: 'I2C',
  spi: 'SPI',
  uart: 'UART',
  can: 'CAN',
  rs485: 'RS-485',
  ethernet: 'ETH',
  i2s: 'I2S',
  gpio: 'GPIO',
  analog: 'ADC',
  pwm: 'PWM',
}

export function WiringDiagram({ board, wiring }: { board: Board; wiring: WiringPlan }) {
  const groups = wiring.guides
    .map((guide) => ({ ...guide }))
    .filter((guide) => guide.connections.length > 0)

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Cable className="h-5 w-5" />}
        title="No wires to draw yet"
        description="Add at least one module in the previous step. The diagram is generated from the same pin plan as the code."
      />
    )
  }

  const rowHeight = 30
  const top = 110
  const boardX = 20
  const boardWidth = 244
  const componentX = 620
  const componentWidth = 250
  const boardRight = boardX + boardWidth
  const totalRows = groups.reduce((sum, group) => sum + group.connections.length + 1, 0)
  const height = top + totalRows * rowHeight + 60
  const boardHeight = totalRows * rowHeight + 52

  const nets = Array.from(new Set(wiring.connections.map((connection) => connection.net)))

  let cursor = 0
  const layout = groups.map((group) => {
    const headerRow = cursor
    cursor += 1
    const rows = group.connections.map((connection, index) => {
      const row = cursor + index
      return { connection, row }
    })
    cursor += group.connections.length
    return { group, headerRow, rows }
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Net legend</span>
        {nets.map((net) => (
          <span key={net} className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: netColor[net] }} />
            {netLabel[net]}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-slate-600 lg:hidden">
          scroll horizontally →
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-ink-950/70">
        <svg
          viewBox={`0 0 ${900} ${height}`}
          width="100%"
          role="img"
          aria-label={`Wiring diagram for ${board.name}: ${wiring.connections.length} connections across ${groups.length} modules`}
          className="min-w-[900px]"
          style={{ minHeight: 320 }}
        >
          <defs>
            <pattern id="wire-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="900" height={height} fill="url(#wire-grid)" />

          <text x={boardX} y="34" fill="#8cf8cf" fontSize="9" fontFamily="ui-monospace, monospace" letterSpacing="2">
            TARGET BOARD
          </text>
          <text x={boardX} y="56" fill="#f8fafc" fontSize="15" fontWeight="600">
            {board.shortName}
          </text>
          <text x={boardX} y="74" fill="#64748b" fontSize="10" fontFamily="ui-monospace, monospace">
            {board.chip} · {board.logicVoltage} V logic
          </text>

          <rect
            x={boardX}
            y={top - 24}
            width={boardWidth}
            height={boardHeight}
            rx="14"
            fill="rgba(13,21,30,0.92)"
            stroke="rgba(84,230,177,0.28)"
            strokeWidth="1"
          />
          <rect
            x={boardX + 12}
            y={top - 12}
            width={boardWidth - 24}
            height="4"
            rx="2"
            fill={board.accent}
            opacity="0.6"
          />

          {layout.map(({ group, headerRow, rows }) => {
            const groupTop = top + headerRow * rowHeight - 10
            const groupHeight = (rows.length + 1) * rowHeight + 6
            return (
              <g key={group.instanceId}>
                <rect
                  x={componentX}
                  y={groupTop}
                  width={componentWidth}
                  height={groupHeight}
                  rx="12"
                  fill="rgba(10,17,24,0.92)"
                  stroke="rgba(148,163,184,0.16)"
                  strokeWidth="1"
                />
                <text
                  x={componentX + 14}
                  y={groupTop + 22}
                  fill="#e2e8f0"
                  fontSize="12"
                  fontWeight="600"
                >
                  {group.componentLabel}
                </text>
                <text
                  x={componentX + componentWidth - 14}
                  y={groupTop + 22}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  {rows.length} pin{rows.length === 1 ? '' : 's'}
                </text>

                {rows.map(({ connection, row }) => {
                  const y = top + row * rowHeight
                  const color = connectionColor(connection)
                  const startX = boardRight
                  const endX = componentX
                  const mid = (startX + endX) / 2
                  return (
                    <g key={connection.id}>
                      <title>
                        {`${connection.componentLabel} ${connection.componentPinLabel} ↔ ${connection.boardPinLabel} (${connection.netLabel})${connection.note ? ` — ${connection.note}` : ''}`}
                      </title>
                      <path
                        d={`M ${startX} ${y} C ${mid - 40} ${y}, ${mid + 40} ${y}, ${endX} ${y}`}
                        fill="none"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        opacity="0.9"
                      />
                      <circle cx={startX} cy={y} r="3" fill={color} />
                      <circle cx={endX} cy={y} r="3" fill={color} />
                      <text
                        x={startX - 10}
                        y={y + 4}
                        textAnchor="end"
                        fill="#cbd5e1"
                        fontSize="9"
                        fontFamily="ui-monospace, monospace"
                      >
                        {connection.boardPinLabel}
                      </text>
                      <text
                        x={startX + 10}
                        y={y + 4}
                        fill="#475569"
                        fontSize="8"
                        fontFamily="ui-monospace, monospace"
                      >
                        {connection.boardPinCode}
                      </text>
                      <text
                        x={mid}
                        y={y - 5}
                        textAnchor="middle"
                        fill={color}
                        fontSize="8"
                        fontFamily="ui-monospace, monospace"
                        opacity="0.85"
                      >
                        {connection.netLabel}
                      </text>
                      <text
                        x={endX + 12}
                        y={y + 4}
                        fill="#cbd5e1"
                        fontSize="9"
                        fontFamily="ui-monospace, monospace"
                      >
                        {connection.componentPinLabel}
                      </text>
                    </g>
                  )
                })}
              </g>
            )
          })}

          <text
            x={900 - 20}
            y={height - 18}
            textAnchor="end"
            fill="#334155"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
          >
            MakerWire AI · generated {new Date(wiring.generatedAt).toLocaleTimeString()}
          </text>
        </svg>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Reference diagram, not a physical footprint. Power and ground are drawn once per module; confirm the silkscreen
        pin order on your own breakout before inserting wires.
      </p>
    </div>
  )
}
