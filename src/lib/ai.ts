import type {
  ComponentDefinition,
  ComponentRole,
  Framework,
  ProjectComponent,
  TargetFramework,
  WiringPlan,
} from '../types'
import { getBoard, getComponent } from '../catalog/registry'
import { uid } from './utils'

export interface CodeRequestComponent {
  id: string
  name: string
  interfaces: string[]
  i2cAddress?: string
  pins: string[]
}

export interface GenerateCodeRequest {
  prompt: string
  framework: TargetFramework
  board: {
    id: string
    name: string
    chip: string
    family: string
    logicVoltage: number
    adcBits: number
    wifi: boolean
  }
  components: CodeRequestComponent[]
  wiring: {
    status: WiringPlan['status']
    signals: number
    connections: Array<{
      boardPin: string
      boardPinLabel: string
      component: string
      componentPin: string
      role: string
      note?: string
    }>
    warnings: Array<{ severity: string; title: string; detail: string }>
  }
  localCode?: string
}

export interface GenerateCodeResponse {
  ok: boolean
  source: 'cloud' | 'local'
  title?: string
  code: string
  filename: string
  explanation: string
  libraries: string[]
  framework?: Framework
  model?: string
  note?: string
  error?: string
}

export interface WiringReview {
  ok: boolean
  source: 'cloud' | 'local'
  summary: string
  risks: string[]
  checks: string[]
  model?: string
  note?: string
  error?: string
}

export interface LookupResponse {
  ok: boolean
  component: ComponentDefinition | null
  candidates: ComponentDefinition[]
  note?: string
  error?: string
}

const postJson = async <T>(path: string, body: unknown, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      throw new Error(response.ok ? 'The AI service returned a non-JSON response.' : text.slice(0, 200))
    }
    if (!response.ok) {
      const message =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Request failed with HTTP ${response.status}.`
      throw new Error(message)
    }
    return data as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The AI request timed out. The local engine output is still available.')
    }
    throw error instanceof Error ? error : new Error('The AI request failed.')
  } finally {
    window.clearTimeout(timeout)
  }
}

export const buildCodeRequest = (
  boardId: string,
  projectComponents: ProjectComponent[],
  customComponents: ComponentDefinition[],
  wiring: WiringPlan,
  prompt: string,
  framework: TargetFramework,
  localCode?: string,
): GenerateCodeRequest | null => {
  const board = getBoard(boardId)
  if (!board) return null
  const components = projectComponents
    .map((item): CodeRequestComponent | null => {
      const def = getComponent(item.componentId, customComponents)
      if (!def) return null
      return {
        id: def.id,
        name: def.name,
        interfaces: def.interfaces,
        i2cAddress: def.i2cAddress,
        pins: def.pins.map((pin) => `${pin.label}:${pin.role}`),
      }
    })
    .filter((item): item is CodeRequestComponent => item !== null)

  return {
    prompt,
    framework,
    board: {
      id: board.id,
      name: board.name,
      chip: board.chip,
      family: board.family,
      logicVoltage: board.logicVoltage,
      adcBits: board.code.adcBits,
      wifi: board.code.wifi,
    },
    components,
    wiring: {
      status: wiring.status,
      signals: wiring.stats.signals,
      connections: wiring.connections.map((connection) => ({
        boardPin: connection.boardPinCode,
        boardPinLabel: connection.boardPinLabel,
        component: connection.componentLabel,
        componentPin: connection.componentPinLabel,
        role: connection.role,
        note: connection.note,
      })),
      warnings: wiring.warnings.map((warning) => ({
        severity: warning.severity,
        title: warning.title,
        detail: warning.detail,
      })),
    },
    localCode,
  }
}

export async function requestGeneratedCode(
  request: GenerateCodeRequest,
  timeoutMs = 60_000,
): Promise<GenerateCodeResponse> {
  const response = await postJson<GenerateCodeResponse>('/api/generate-code', request, timeoutMs)
  if (!response || typeof response.code !== 'string' || !response.code.trim()) {
    throw new Error('The AI service returned an empty sketch.')
  }
  return response
}

export async function requestWiringReview(
  boardId: string,
  projectComponents: ProjectComponent[],
  customComponents: ComponentDefinition[],
  wiring: WiringPlan,
  prompt: string,
): Promise<WiringReview> {
  const board = getBoard(boardId)
  if (!board) throw new Error('Select a board before requesting a wiring review.')
  const components = projectComponents
    .map((item) => {
      const def = getComponent(item.componentId, customComponents)
      return def
        ? {
            id: def.id,
            name: def.name,
            voltage: def.voltage,
            interfaces: def.interfaces,
            pins: def.pins.map((pin) => `${pin.label}:${pin.role}`),
            safety: def.safety,
          }
        : null
    })
    .filter(Boolean)

  return postJson<WiringReview>(
    '/api/generate-wiring',
    {
      prompt,
      board: {
        id: board.id,
        name: board.name,
        chip: board.chip,
        family: board.family,
        logicVoltage: board.logicVoltage,
        powerPins: board.powerPins.map((pin) => `${pin.label} ${pin.voltage}V ${pin.maxCurrentMa}mA`),
      },
      components,
      wiring: {
        status: wiring.status,
        connections: wiring.connections.map((connection) => ({
          boardPin: connection.boardPinCode,
          boardPinLabel: connection.boardPinLabel,
          component: connection.componentLabel,
          componentPin: connection.componentPinLabel,
          role: connection.role,
        })),
        warnings: wiring.warnings.map((warning) => ({
          severity: warning.severity,
          title: warning.title,
          detail: warning.detail,
        })),
      },
    },
    35_000,
  )
}

export async function lookupComponent(query: string): Promise<LookupResponse> {
  const response = await postJson<LookupResponse>(
    '/api/lookup-component',
    { query },
    35_000,
  )
  if (!response.ok) throw new Error(response.error || 'Component lookup failed.')
  return response
}

export interface ApiHealth {
  ok: boolean
  ai: {
    workersAi: boolean
    openai: boolean
    model: string | null
  }
  time: string
}

export async function getApiHealth(): Promise<ApiHealth | null> {
  try {
    const response = await fetch('/api/health', { headers: { accept: 'application/json' } })
    if (!response.ok) return null
    return (await response.json()) as ApiHealth
  } catch {
    return null
  }
}

/** Used by the manual custom-component form. */
const ROLES: ComponentRole[] = [
  'power',
  'ground',
  'i2c-sda',
  'i2c-scl',
  'spi-sck',
  'spi-mosi',
  'spi-miso',
  'spi-cs',
  'uart-tx',
  'uart-rx',
  'analog',
  'digital',
  'pwm',
  'onewire',
  'nc',
]

export const makeCustomComponent = (input: {
  name: string
  category: string
  description?: string
  voltage: number
  pins: string
}): ComponentDefinition => {
  const id = `custom-${uid('part')}`
  const pins = input.pins
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [label, role] = line.split(':').map((part) => part.trim())
      const safeRole = ROLES.includes(role as ComponentRole)
        ? (role as ComponentRole)
        : 'digital'
      return {
        id: `pin${index + 1}`,
        label: label || `Pin ${index + 1}`,
        role: safeRole,
        required: true,
      }
    })

  if (!pins.some((pin) => pin.role === 'power')) pins.unshift({ id: 'vcc', label: 'VCC', role: 'power', required: true })
  if (!pins.some((pin) => pin.role === 'ground')) pins.unshift({ id: 'gnd', label: 'GND', role: 'ground', required: true })

  return {
    id,
    name: input.name.trim() || 'Custom module',
    shortName: (input.name.trim() || 'Custom module').slice(0, 26),
    category: input.category.trim() || 'Custom',
    description: input.description?.trim() || 'User-defined module. Verify the pin roles and voltage ratings against the datasheet.',
    voltage: { min: Math.max(1.8, input.voltage - 0.3), max: input.voltage + 0.3, typical: input.voltage },
    logicVoltage: input.voltage,
    fiveVoltTolerant: input.voltage >= 4.5,
    outputs5v: input.voltage >= 4.5,
    current: { typicalMa: 20 },
    interfaces: ['Custom'],
    pins,
    safety: [
      'Custom component created from user input — verify every pin and voltage against the datasheet before powering the circuit.',
    ],
    tags: ['custom', input.category.toLowerCase()],
    aiGenerated: false,
  }
}
