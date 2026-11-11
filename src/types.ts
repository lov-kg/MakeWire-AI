export type Framework = 'arduino' | 'esp-idf' | 'micropython' | 'python' | 'structured-text'
export type TargetFramework = 'auto' | Framework
export type Stage = 'board' | 'components' | 'wiring' | 'code'

export type PinCapability =
  | 'gpio'
  | 'adc'
  | 'dac'
  | 'pwm'
  | 'i2c-sda'
  | 'i2c-scl'
  | 'spi-sck'
  | 'spi-mosi'
  | 'spi-miso'
  | 'spi-cs'
  | 'uart-tx'
  | 'uart-rx'
  | 'can-tx'
  | 'can-rx'
  | 'can-h'
  | 'can-l'
  | 'rs485-a'
  | 'rs485-b'
  | 'ethernet'
  | 'i2s-bclk'
  | 'i2s-lrck'
  | 'i2s-dout'
  | 'i2s-din'

export type LifecycleStatus = 'active' | 'preview' | 'nrnd' | 'obsolete' | 'unknown'

export interface BoardPin {
  id: string
  label: string
  pinCode: string
  gpio?: number | string
  caps: PinCapability[]
  note?: string
  restricted?: boolean
  inputOnly?: boolean
}

export interface BoardPowerPin {
  id: string
  label: string
  voltage: number
  maxCurrentMa: number
  note?: string
}

export interface BoardDefaults {
  i2cSda?: string
  i2cScl?: string
  spiSck?: string
  spiMosi?: string
  spiMiso?: string
  spiCs?: string
  uartTx?: string
  uartRx?: string
}

export interface BoardCodeMeta {
  platform: 'arduino' | 'esp-idf' | 'micropython' | 'python' | 'structured-text' | 'none'
  ledPinCode?: string
  serialBaud: number
  adcBits: number
  i2cSetup: 'begin' | 'setPins'
  wifi: boolean
  wifiHeader?: string
}

export interface Board {
  id: string
  name: string
  shortName: string
  vendor: string
  chip: string
  family: string
  logicVoltage: number
  inputVoltage: string
  flash: string
  ram: string
  clock: string
  gpioCount: number
  adcChannels: number
  dacChannels?: number
  connectivity: string[]
  interfaces: string[]
  formFactor: string
  description: string
  bestFor: string[]
  tags: string[]
  pins: BoardPin[]
  powerPins: BoardPowerPin[]
  defaults: BoardDefaults
  code: BoardCodeMeta
  notes: string[]
  accent: string
  /** Fieldbus / industrial protocols exposed by the board (CAN, RS-485, Modbus, EtherCAT...). */
  protocols?: string[]
  operatingTempC?: [number, number]
  ingressProtection?: string
  lifecycle?: LifecycleStatus
  datasheetUrl?: string
  standards?: string[]
  industrial?: boolean
  verified?: boolean
  /** Pack that owns this definition, filled in by the registry. */
  pack?: string
}

export type ComponentRole =
  | 'power'
  | 'ground'
  | 'i2c-sda'
  | 'i2c-scl'
  | 'spi-sck'
  | 'spi-mosi'
  | 'spi-miso'
  | 'spi-cs'
  | 'uart-tx'
  | 'uart-rx'
  | 'can-tx'
  | 'can-rx'
  | 'can-h'
  | 'can-l'
  | 'rs485-a'
  | 'rs485-b'
  | 'ethernet'
  | 'i2s-bclk'
  | 'i2s-lrck'
  | 'i2s-dout'
  | 'i2s-din'
  | 'analog'
  | 'digital'
  | 'pwm'
  | 'onewire'
  | 'bus'
  | 'nc'

export interface ComponentPin {
  id: string
  label: string
  role: ComponentRole
  direction?: 'in' | 'out' | 'bidir'
  required?: boolean
  note?: string
}

export interface ComponentVoltage {
  min: number
  max: number
  typical: number
}

export interface ComponentCurrent {
  typicalMa: number
  peakMa?: number
}

export interface ComponentDefinition {
  id: string
  name: string
  shortName: string
  category: string
  description: string
  manufacturer?: string
  voltage: ComponentVoltage
  logicVoltage: number
  /** Inputs tolerate 5 V logic even when the module runs at 3.3 V. */
  fiveVoltTolerant: boolean
  /** The module actively drives 5 V on an output (needs shifting on 3.3 V boards). */
  outputs5v: boolean
  /** Actual output voltage when it differs from the logic supply (industrial 24 V, relays...). */
  outputVoltage?: number
  current: ComponentCurrent
  interfaces: string[]
  pins: ComponentPin[]
  i2cAddress?: string
  requiresExternalSupply?: boolean
  safety: string[]
  codeHints?: string[]
  tags: string[]
  aiGenerated?: boolean
  /** Industrial / robotics catalogue metadata. */
  protocols?: string[]
  operatingTempC?: [number, number]
  ingressProtection?: string
  lifecycle?: LifecycleStatus
  datasheetUrl?: string
  standards?: string[]
  industrial?: boolean
  verified?: boolean
  /** Pack that owns this definition, filled in by the registry. */
  pack?: string
}

export interface ProjectComponent {
  instanceId: string
  componentId: string
  quantity: number
  powerOverride: 'auto' | '3.3' | '5' | '12' | '24' | '48'
  notes?: string
}

export interface GeneratedCode {
  id: string
  title: string
  prompt: string
  framework: Framework
  source: 'cloud' | 'local'
  code: string
  filename: string
  explanation: string
  libraries: string[]
  createdAt: string
}

export interface Project {
  id: string
  name: string
  boardId: string | null
  components: ProjectComponent[]
  prompt: string
  framework: TargetFramework
  codeHistory: GeneratedCode[]
  activeCodeId: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkspaceData {
  version: 1
  projects: Project[]
  activeProjectId: string
  customComponents: ComponentDefinition[]
}

export type NetKind =
  | 'power-3v3'
  | 'power-5v'
  | 'power-dc'
  | 'ground'
  | 'i2c'
  | 'spi'
  | 'uart'
  | 'can'
  | 'rs485'
  | 'ethernet'
  | 'i2s'
  | 'gpio'
  | 'analog'
  | 'pwm'

export interface WiringConnection {
  id: string
  boardPinId: string
  boardPinLabel: string
  boardPinCode: string
  boardPinKind: 'power' | 'ground' | 'gpio'
  componentInstanceId: string
  componentId: string
  componentLabel: string
  componentPinId: string
  componentPinLabel: string
  role: ComponentRole
  net: NetKind
  netLabel: string
  note?: string
}

export type WarningSeverity = 'danger' | 'warning' | 'info'

export interface WiringWarning {
  id: string
  severity: WarningSeverity
  title: string
  detail: string
  componentInstanceId?: string
}

export interface PinUsage {
  boardPinId: string
  label: string
  kind: 'power' | 'ground' | 'gpio'
  nets: string[]
  componentLabels: string[]
}

export interface ComponentGuide {
  instanceId: string
  componentId: string
  componentLabel: string
  connections: WiringConnection[]
  safety: string[]
}

export interface WiringPlan {
  boardId: string
  connections: WiringConnection[]
  warnings: WiringWarning[]
  guides: ComponentGuide[]
  pinUsage: PinUsage[]
  powerRails: {
    rail: string
    voltage: number
    currentMa: number
    capacityMa: number
  }[]
  unconnected: {
    componentLabel: string
    pinLabel: string
    reason: string
  }[]
  stats: {
    connections: number
    signals: number
    components: number
    usedBoardPins: number
  }
  status: 'ready' | 'attention' | 'blocked'
  generatedAt: string
}
