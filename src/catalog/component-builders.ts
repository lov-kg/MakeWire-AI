import type {
  ComponentCurrent,
  ComponentDefinition,
  ComponentPin,
  ComponentRole,
  ComponentVoltage,
  LifecycleStatus,
} from '../types'

export const cp = (
  id: string,
  label: string,
  role: ComponentRole,
  direction?: ComponentPin['direction'],
  note?: string | boolean,
  required = true,
): ComponentPin => ({
  id,
  label,
  role,
  direction,
  note: typeof note === 'string' ? note : undefined,
  required: typeof note === 'boolean' ? note : required,
})

export const powerPin = (label = 'VCC', voltage?: number) =>
  cp(
    'vcc',
    label,
    'power',
    'in',
    voltage && voltage >= 12 ? `${voltage} V nominal; observe polarity and use a fused supply.` : undefined,
  )
export const groundPin = (label = 'GND') => cp('gnd', label, 'ground', 'in')

export interface ComponentSeed {
  id: string
  name: string
  shortName?: string
  category: string
  description?: string
  manufacturer?: string
  voltage?: Partial<ComponentVoltage> | number
  logicVoltage?: number
  fiveVoltTolerant?: boolean
  outputs5v?: boolean
  outputVoltage?: number
  current?: Partial<ComponentCurrent> | number
  interfaces?: string[]
  pins?: ComponentPin[]
  i2cAddress?: string
  requiresExternalSupply?: boolean
  safety?: string[]
  codeHints?: string[]
  tags?: string[]
  protocols?: string[]
  operatingTempC?: [number, number]
  ingressProtection?: string
  lifecycle?: LifecycleStatus
  datasheetUrl?: string
  standards?: string[]
  industrial?: boolean
  verified?: boolean
}

const voltageOf = (voltage: ComponentSeed['voltage']): ComponentVoltage => {
  if (typeof voltage === 'number') {
    const min = voltage >= 12 ? Math.max(5, voltage * 0.8) : voltage >= 5 ? 4.5 : Math.max(1.8, voltage * 0.9)
    const max = voltage >= 12 ? voltage * 1.2 : voltage >= 5 ? 5.5 : 3.6
    return { min, max, typical: voltage }
  }
  return {
    min: voltage?.min ?? 3.3,
    max: voltage?.max ?? 5.5,
    typical: voltage?.typical ?? 3.3,
  }
}

const currentOf = (current: ComponentSeed['current']): ComponentCurrent => {
  if (typeof current === 'number') return { typicalMa: current, peakMa: current * 1.5 }
  return { typicalMa: current?.typicalMa ?? 10, peakMa: current?.peakMa }
}

export const makeComponent = (seed: ComponentSeed): ComponentDefinition => {
  const voltage = voltageOf(seed.voltage)
  const logicVoltage = seed.logicVoltage ?? (voltage.typical >= 4.5 ? 5 : 3.3)
  return {
    id: seed.id,
    name: seed.name,
    shortName: seed.shortName ?? seed.name.split(/[(/]/)[0].trim(),
    category: seed.category,
    description: seed.description ?? `${seed.name} — ${seed.category.toLowerCase()} module.`,
    manufacturer: seed.manufacturer,
    voltage,
    logicVoltage,
    fiveVoltTolerant: seed.fiveVoltTolerant ?? logicVoltage >= 4.5,
    outputs5v: seed.outputs5v ?? false,
    outputVoltage: seed.outputVoltage,
    current: currentOf(seed.current),
    interfaces: seed.interfaces ?? [],
    pins: seed.pins ?? [powerPin(), groundPin()],
    i2cAddress: seed.i2cAddress,
    requiresExternalSupply: seed.requiresExternalSupply,
    safety: seed.safety ?? [],
    codeHints: seed.codeHints,
    tags: seed.tags ?? [],
    protocols: seed.protocols,
    operatingTempC: seed.operatingTempC,
    ingressProtection: seed.ingressProtection,
    lifecycle: seed.lifecycle ?? 'active',
    datasheetUrl: seed.datasheetUrl,
    standards: seed.standards,
    industrial: seed.industrial,
    verified: seed.verified,
  }
}

const extra = (pins?: ComponentPin[]) => pins ?? []

export interface I2cSeed extends ComponentSeed {
  address: string
  pinLabels?: { vcc?: string; gnd?: string; sda?: string; scl?: string }
  extraPins?: ComponentPin[]
}

export const i2c = (seed: I2cSeed): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['I2C'],
    pins: [
      powerPin(seed.pinLabels?.vcc),
      groundPin(seed.pinLabels?.gnd),
      cp('sda', seed.pinLabels?.sda ?? 'SDA', 'i2c-sda', 'bidir', 'Requires pull-ups to the logic rail.'),
      cp('scl', seed.pinLabels?.scl ?? 'SCL', 'i2c-scl', 'in', 'Requires pull-ups to the logic rail.'),
      ...extra(seed.extraPins),
    ],
    i2cAddress: seed.address,
    tags: ['i2c', ...(seed.tags ?? [])],
  })

export interface UartSeed extends ComponentSeed {
  pinLabels?: { vcc?: string; gnd?: string; tx?: string; rx?: string }
  extraPins?: ComponentPin[]
  baud?: number
}

export const uart = (seed: UartSeed): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['UART'],
    pins: [
      powerPin(seed.pinLabels?.vcc),
      groundPin(seed.pinLabels?.gnd),
      cp('tx', seed.pinLabels?.tx ?? 'TX', 'uart-tx', 'out', 'Module TX crosses to the board RX.'),
      cp('rx', seed.pinLabels?.rx ?? 'RX', 'uart-rx', 'in', 'Module RX crosses to the board TX.'),
      ...extra(seed.extraPins),
    ],
    tags: ['uart', ...(seed.tags ?? [])],
  })

export interface SpiSeed extends ComponentSeed {
  pinLabels?: { vcc?: string; gnd?: string; sck?: string; mosi?: string; miso?: string; cs?: string }
  noMiso?: boolean
  extraPins?: ComponentPin[]
}

export const spi = (seed: SpiSeed): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['SPI'],
    pins: [
      powerPin(seed.pinLabels?.vcc),
      groundPin(seed.pinLabels?.gnd),
      cp('sck', seed.pinLabels?.sck ?? 'SCK', 'spi-sck', 'in'),
      cp('mosi', seed.pinLabels?.mosi ?? 'MOSI', 'spi-mosi', 'in'),
      ...(seed.noMiso ? [] : [cp('miso', seed.pinLabels?.miso ?? 'MISO', 'spi-miso', 'out')]),
      cp('cs', seed.pinLabels?.cs ?? 'CS', 'spi-cs', 'in', 'Chip select; one per device.'),
      ...extra(seed.extraPins),
    ],
    tags: ['spi', ...(seed.tags ?? [])],
  })

export interface AnalogSeed extends ComponentSeed {
  outputLabel?: string
  extraPins?: ComponentPin[]
}

export const analog = (seed: AnalogSeed): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['Analog'],
    pins: [
      powerPin(),
      groundPin(),
      cp('out', seed.outputLabel ?? 'OUT', 'analog', 'out', 'Analog voltage output; check the board ADC reference.'),
      ...extra(seed.extraPins),
    ],
    tags: ['analog', ...(seed.tags ?? [])],
  })

export interface DigitalSeed extends ComponentSeed {
  input?: boolean
  extraPins?: ComponentPin[]
}

export const digital = (seed: DigitalSeed): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['GPIO'],
    pins: [
      powerPin(),
      groundPin(),
      cp('signal', 'SIGNAL', 'digital', seed.input ? 'out' : 'in'),
      ...extra(seed.extraPins),
    ],
    tags: ['gpio', ...(seed.tags ?? [])],
  })

export const relayModule = (
  seed: ComponentSeed & { channels?: number; acRating?: string; dcRating?: string; inputVoltage?: number },
): ComponentDefinition => {
  const channels = seed.channels ?? 1
  const pins: ComponentPin[] = [powerPin('VCC'), groundPin('GND')]
  for (let i = 1; i <= channels; i += 1) {
    pins.push(cp(`in${i}`, `IN${i}`, 'digital', 'in', 'Active-low on most blue relay boards.'))
  }
  return makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['GPIO'],
    pins,
    requiresExternalSupply: seed.requiresExternalSupply ?? channels > 2,
    outputs5v: false,
    outputVoltage: seed.inputVoltage ?? 5,
    tags: ['relay', 'isolated', `${channels}ch`, ...(seed.tags ?? [])],
    safety: [
      `Contacts are rated ${seed.acRating ?? '10 A 250 VAC'} / ${seed.dcRating ?? '10 A 30 VDC'} only when using a genuine module with a suitable snubber.`,
      'Mains wiring must be enclosed, fused and installed by a qualified electrician.',
      ...(seed.safety ?? []),
    ],
  })
}

export const servo = (seed: ComponentSeed & { torqueKgCm?: number }): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['PWM'],
    pins: [
      powerPin('VCC'),
      groundPin('GND'),
      cp('signal', 'SIGNAL', 'pwm', 'in', 'PWM control; power the servo from a dedicated 5-6 V supply.'),
    ],
    requiresExternalSupply: seed.requiresExternalSupply ?? true,
    current: seed.current ?? { typicalMa: 250, peakMa: 900 },
    tags: ['servo', 'pwm', ...(seed.tags ?? [])],
    safety: [
      'Never power a servo from the board 3.3 V pin; use a BEC or a 5-6 V supply with a common ground.',
      ...(seed.safety ?? []),
    ],
  })

export const stepperDriver = (
  seed: ComponentSeed & { microsteps?: number; maxCurrentA?: number; motorVoltage?: string },
): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['GPIO'],
    pins: [
      powerPin('VMOT'),
      groundPin('GND'),
      cp('step', 'STEP', 'digital', 'in'),
      cp('dir', 'DIR', 'digital', 'in'),
      cp('en', 'EN', 'digital', 'in', 'Enable is active-low on most Pololu-style drivers.'),
      ...(seed.pins ?? []),
    ],
    requiresExternalSupply: true,
    tags: ['stepper', 'motor', `${seed.maxCurrentA ?? 2}A`, ...(seed.tags ?? [])],
    safety: [
      `Set the current limit to ${seed.maxCurrentA ?? 2} A or less before connecting the motor.`,
      'Never disconnect the motor while the driver is powered — the coil inductance will destroy the driver.',
      ...(seed.safety ?? []),
    ],
  })

export const canNode = (seed: ComponentSeed): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['CAN'],
    pins: [
      powerPin(),
      groundPin(),
      cp('tx', 'CTX / TX', 'can-tx', 'in', 'Controller TX to transceiver TXD.'),
      cp('rx', 'CRX / RX', 'can-rx', 'out', 'Transceiver RXD to controller RX.'),
      cp('canh', 'CANH', 'can-h', 'bidir', 'CAN bus high; 120 Ω termination at each end of the trunk.', false),
      cp('canl', 'CANL', 'can-l', 'bidir', 'CAN bus low; 120 Ω termination at each end of the trunk.', false),
    ],
    tags: ['can', 'fieldbus', ...(seed.tags ?? [])],
    protocols: seed.protocols ?? ['CAN 2.0B'],
  })

export const rs485Node = (seed: ComponentSeed & { halfDuplex?: boolean }): ComponentDefinition =>
  makeComponent({
    ...seed,
    interfaces: seed.interfaces ?? ['UART', 'RS-485'],
    pins: [
      powerPin(),
      groundPin(),
      cp('tx', 'DI / TX', 'uart-tx', 'in'),
      cp('rx', 'RO / RX', 'uart-rx', 'out'),
      ...(seed.halfDuplex === false
        ? []
        : [
            cp('de', 'DE / RE', 'digital', 'in', 'Driver enable; tie DE and RE together for half-duplex.'),
          ]),
      cp('a', 'A', 'rs485-a', 'bidir', 'RS-485 A; use twisted pair and 120 Ω termination.', false),
      cp('b', 'B', 'rs485-b', 'bidir', 'RS-485 B; use twisted pair and 120 Ω termination.', false),
    ],
    tags: ['rs485', 'fieldbus', 'modbus', ...(seed.tags ?? [])],
    protocols: seed.protocols ?? ['RS-485', 'Modbus RTU'],
  })

export const industrialSensor = (
  seed: ComponentSeed & { supply?: number; output?: 'npn' | 'pnp' | 'analog' | '4-20ma' | 'io-link' },
): ComponentDefinition => {
  const supply = seed.supply ?? 24
  const output = seed.output ?? 'pnp'
  const pins: ComponentPin[] = [
    powerPin('L+'),
    groundPin('M'),
    ...(output === 'analog' || output === '4-20ma'
      ? [
          cp(
            'out',
            output === '4-20ma' ? 'I OUT' : 'OUT',
            'analog',
            'out',
            output === '4-20ma'
              ? 'Current loop: use a precision shunt and an isolated ADC.'
              : 'Analog output; verify 0-10 V vs 0-5 V.',
          ),
        ]
      : output === 'io-link'
        ? [cp('io', 'C/Q', 'uart-rx', 'bidir', 'IO-Link needs an IO-Link master, not a bare GPIO.')]
        : [cp('out', 'OUT', 'digital', 'out', `${output.toUpperCase()} open-collector output; verify the load and pull-up.`)]),
  ]
  return makeComponent({
    ...seed,
    voltage: seed.voltage ?? supply,
    logicVoltage: supply,
    outputVoltage: output === 'pnp' ? supply : output === 'npn' ? 0 : undefined,
    pins,
    interfaces: seed.interfaces ?? [output === 'io-link' ? 'IO-Link' : output === 'analog' || output === '4-20ma' ? 'Analog' : 'GPIO'],
    requiresExternalSupply: true,
    industrial: seed.industrial ?? true,
    tags: ['industrial', '24v', output, ...(seed.tags ?? [])],
    protocols: seed.protocols ?? (output === 'io-link' ? ['IO-Link'] : []),
    safety: [
      'Industrial sensors are usually 24 V. Do not connect a 24 V PNP output directly to a 3.3 V GPIO.',
      'Use an opto-isolated input, a relay, or a level shifter rated for the sensor output.',
      ...(seed.safety ?? []),
    ],
  })
}
