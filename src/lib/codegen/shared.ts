import type {
  Board,
  ComponentDefinition,
  Framework,
  ProjectComponent,
  TargetFramework,
  WiringConnection,
  WiringPlan,
} from '../../types'
import { getComponent } from '../../catalog/registry'
import { slugify } from '../utils'

export interface LocalCodeInput {
  board: Board
  projectComponents: ProjectComponent[]
  customComponents?: ComponentDefinition[]
  wiring: WiringPlan
  prompt: string
  framework: TargetFramework
}

export interface ResolvedPart {
  item: ProjectComponent
  def: ComponentDefinition
}

export interface BuildContext {
  board: Board
  plan: WiringPlan
  parts: ResolvedPart[]
  prompt: string
  lower: string
  intervalMs: number
  framework: Framework
  has: (id: string) => boolean
  pin: (componentId: string, pinId: string) => WiringConnection | undefined
  firstI2C: (role: 'i2c-sda' | 'i2c-scl') => WiringConnection | undefined
  firstSPI: (role: 'spi-sck' | 'spi-mosi' | 'spi-miso') => WiringConnection | undefined
  boardWifi: boolean
}

export interface FeatureSet {
  hasDht: boolean
  hasBme: boolean
  hasMpu: boolean
  hasUltrasonic: boolean
  hasGas: boolean
  hasPot: boolean
  hasButton: boolean
  hasOled: boolean
  hasTft: boolean
  hasRelay: boolean
  hasServo: boolean
  hasStepper: boolean
  hasNeopixel: boolean
  hasGps: boolean
  hasLte: boolean
  hasSd: boolean
  hasRtc: boolean
  hasCamera: boolean
  hasLed: boolean
  hasBuzzer: boolean
  hasI2C: boolean
  hasSpi: boolean
  hasUart: boolean
  hasSensor: boolean
  hasDisplay: boolean
  wantsWeb: boolean
  wantsWifi: boolean
  wantsSerial: boolean
  canUseWifi: boolean
  webWithoutWifi: boolean
  intervalMs: number
}

export interface CodeDraft {
  code: string
  libraries: string[]
  explanation: string
  filename: string
}

export const resolveFramework = (target: TargetFramework, board: Board): Framework => {
  const native = board.code.platform
  if (target === 'auto') {
    if (native === 'python') return 'python'
    if (native === 'structured-text') return 'structured-text'
    if (native === 'micropython') return 'micropython'
    return 'arduino'
  }
  if (target === 'arduino' && (native === 'python' || native === 'structured-text')) return native
  // Never emit a target the board cannot build. Fall back to the board's native
  // platform, then to Arduino for microcontrollers.
  if (target === 'esp-idf' && (board.family !== 'Espressif' || board.id === 'esp8266-nodemcu')) {
    return native === 'structured-text' ? 'structured-text' : native === 'python' ? 'python' : 'arduino'
  }
  if (target === 'micropython' && (board.family === 'Arduino' || board.id === 'esp8266-nodemcu')) return 'arduino'
  if (target === 'micropython' && (native === 'python' || native === 'structured-text')) return native
  if (target === 'python' && native !== 'python') {
    return native === 'structured-text' ? 'structured-text' : 'arduino'
  }
  if (target === 'structured-text' && native !== 'structured-text') {
    return native === 'python' ? 'python' : 'arduino'
  }
  return target
}

export const frameworkLabel = (framework: Framework): string => {
  if (framework === 'esp-idf') return 'ESP-IDF C++'
  if (framework === 'micropython') return 'MicroPython'
  if (framework === 'python') return 'Python (Linux SBC)'
  if (framework === 'structured-text') return 'IEC 61131-3 Structured Text'
  return 'Arduino C++'
}

const resolveParts = (
  projectComponents: ProjectComponent[],
  customComponents: ComponentDefinition[],
): ResolvedPart[] =>
  projectComponents
    .map((item) => {
      const def = getComponent(item.componentId, customComponents)
      return def ? { item, def } : null
    })
    .filter((part): part is ResolvedPart => Boolean(part))

const parseInterval = (prompt: string): number | null => {
  const everyMatch = prompt.match(
    /every\s+(\d+(?:\.\d+)?)\s*(ms|millisecond|s|sec|second|seconds|m|min|minute|minutes)/i,
  )
  if (everyMatch) {
    const value = Number(everyMatch[1])
    const unit = everyMatch[2].toLowerCase()
    if (unit.startsWith('ms') || unit.startsWith('millisecond')) return Math.max(100, Math.round(value))
    if (unit === 'm' || unit.startsWith('min')) return Math.max(1, Math.round(value * 60_000))
    return Math.max(1, Math.round(value * 1000))
  }
  const secondsMatch = prompt.match(/(\d+)\s*(?:seconds|secs|s)\b/i)
  if (secondsMatch) return Math.max(1, Number(secondsMatch[1]) * 1000)
  return null
}

export const buildContext = (input: LocalCodeInput): BuildContext => {
  const parts = resolveParts(input.projectComponents, input.customComponents ?? [])
  const lower = input.prompt.toLowerCase()
  const has = (id: string) => parts.some((part) => part.def.id === id)
  const pin = (componentId: string, pinId: string) =>
    input.wiring.connections.find(
      (connection) => connection.componentId === componentId && connection.componentPinId === pinId,
    )
  const firstI2C = (role: 'i2c-sda' | 'i2c-scl') =>
    input.wiring.connections.find((connection) => connection.role === role)
  const firstSPI = (role: 'spi-sck' | 'spi-mosi' | 'spi-miso') =>
    input.wiring.connections.find((connection) => connection.role === role)
  const framework = resolveFramework(input.framework, input.board)
  const hasSensor = ['dht22', 'bme280', 'mpu6050', 'hc-sr04', 'mq2', 'neo6m-gps', 'ds3231-rtc'].some(has)
  const defaultInterval = hasSensor ? 10_000 : 2_000
  const intervalMs = parseInterval(input.prompt) ?? defaultInterval
  const boardWifi = input.board.code.wifi && input.board.connectivity.some((item) => /wi-fi/i.test(item))

  return {
    board: input.board,
    plan: input.wiring,
    parts,
    prompt: input.prompt,
    lower,
    intervalMs,
    framework,
    has,
    pin,
    firstI2C,
    firstSPI,
    boardWifi,
  }
}

export const detectFeatures = (ctx: BuildContext): FeatureSet => {
  const has = ctx.has
  const hasI2C = ctx.plan.connections.some((connection) => connection.role.startsWith('i2c-'))
  const hasSpi = ctx.plan.connections.some((connection) => connection.role.startsWith('spi-'))
  const hasUart = ctx.plan.connections.some((connection) => connection.role.startsWith('uart-'))
  const hasSensor = ['dht22', 'bme280', 'mpu6050', 'hc-sr04', 'mq2', 'neo6m-gps', 'ds3231-rtc'].some(has)
  const wantsWifi = /wi-?fi|wireless|network|cloud|mqtt|http|web|server|dashboard|api/i.test(ctx.prompt)
  const wantsWeb =
    /web\s*server|http|browser|server|dashboard|endpoint|web page|relay via web/i.test(ctx.prompt) ||
    (has('relay-1ch') && /web|wifi|remote|control/i.test(ctx.prompt))
  const webWithoutWifi = wantsWeb && !ctx.boardWifi
  const hasDisplay = has('ssd1306-oled') || has('ili9341-tft')

  return {
    hasDht: has('dht22'),
    hasBme: has('bme280'),
    hasMpu: has('mpu6050'),
    hasUltrasonic: has('hc-sr04'),
    hasGas: has('mq2'),
    hasPot: has('potentiometer'),
    hasButton: has('pushbutton'),
    hasOled: has('ssd1306-oled'),
    hasTft: has('ili9341-tft'),
    hasRelay: has('relay-1ch'),
    hasServo: has('sg90-servo'),
    hasStepper: has('a4988-stepper'),
    hasNeopixel: has('ws2812b-strip'),
    hasGps: has('neo6m-gps'),
    hasLte: has('a7670e-lte'),
    hasSd: has('microsd-spi'),
    hasRtc: has('ds3231-rtc'),
    hasCamera: has('ov2640-dvp'),
    hasLed: has('led-5mm'),
    hasBuzzer: has('active-buzzer'),
    hasI2C,
    hasSpi,
    hasUart,
    hasSensor,
    hasDisplay,
    wantsWeb,
    wantsWifi,
    wantsSerial: /serial|print|monitor|log|display|read|every/i.test(ctx.prompt) || hasSensor,
    canUseWifi: ctx.boardWifi,
    webWithoutWifi,
    intervalMs: ctx.intervalMs,
  }
}

export const pinMacroValue = (connection: WiringConnection | undefined, fallback: string): string =>
  connection?.boardPinCode ?? fallback

export const componentPrefix = (def: ComponentDefinition): string => {
  const preferred: Record<string, string> = {
    dht22: 'DHT22',
    bme280: 'BME280',
    mpu6050: 'MPU6050',
    'hc-sr04': 'HCSR04',
    mq2: 'MQ2',
    'neo6m-gps': 'GPS',
    'ssd1306-oled': 'OLED',
    'ili9341-tft': 'TFT',
    'relay-1ch': 'RELAY',
    'sg90-servo': 'SERVO',
    'a4988-stepper': 'STEPPER',
    'ws2812b-strip': 'NEOPIXEL',
    'a7670e-lte': 'LTE',
    'microsd-spi': 'SD',
    'ds3231-rtc': 'RTC',
    'ov2640-dvp': 'CAMERA',
    potentiometer: 'POT',
    pushbutton: 'BUTTON',
    'active-buzzer': 'BUZZER',
    'led-5mm': 'LED',
  }
  if (preferred[def.id]) return preferred[def.id]
  return def.shortName
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 22)
}

export const baseFilename = (ctx: BuildContext, framework: Framework, title: string): string => {
  const boardSlug = slugify(ctx.board.shortName) || 'board'
  const titleSlug = slugify(title).split('-').slice(0, 4).join('_') || 'project'
  const extension =
    framework === 'micropython'
      ? 'py'
      : framework === 'python'
        ? 'py'
        : framework === 'structured-text'
          ? 'st'
          : framework === 'esp-idf'
            ? 'cpp'
            : 'ino'
  return `makerwire_${boardSlug}_${titleSlug}.${extension}`
}

export const makeTitle = (prompt: string, componentName: string): string => {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  if (!cleaned) return `${componentName} controller`
  const first = cleaned.split(/[.!?]/)[0]
  return first.length > 72 ? `${first.slice(0, 69)}…` : first
}

export const makeExplanation = (
  ctx: BuildContext,
  features: FeatureSet,
  notes: string[],
  source: 'local' | 'cloud' = 'local',
): string => {
  const lines = [
    `Generated for ${ctx.board.name} using ${frameworkLabel(ctx.framework)} from the exact wiring plan (${ctx.plan.connections.length} connections, ${ctx.plan.stats.signals} signals).`,
  ]
  if (source === 'local') {
    lines.push(
      'This is the deterministic on-device generator. It works offline and never invents pin assignments. Add a Cloudflare AI key for free-form firmware synthesis.',
    )
  }
  if (ctx.board.logicVoltage === 3.3) {
    lines.push('The board uses 3.3 V logic. Do not feed 5 V module outputs into GPIO without level shifting.')
  } else {
    lines.push('The board uses 5 V logic. Verify that 3.3 V modules have 5 V-tolerant inputs and level-shift where needed.')
  }
  if (features.wantsWeb && ctx.boardWifi) {
    lines.push('Replace the WIFI_SSID and WIFI_PASSWORD placeholders before flashing. The server binds to port 80 on the local network.')
  }
  if (features.webWithoutWifi) {
    lines.push(
      `${ctx.board.name} has no built-in Wi-Fi. The local engine generated a serial-console version instead; use an ESP32/Pico W or add a network module for a real web server.`,
    )
  }
  if (features.hasLte) {
    lines.push('A7670E: set the APN and carrier-specific AT commands, fit an antenna, and use a dedicated 5 V / 2 A supply. The generated AT scaffold is intentionally conservative.')
  }
  if (features.hasCamera) {
    lines.push('OV2640: a DVP camera needs a dedicated camera peripheral and driver. The generated code does not attempt a generic bit-banged capture path — use the AI enhancer or a camera example for your exact board.')
  }
  if (features.hasSd) {
    lines.push('Format the microSD card as FAT32 and keep SPI wires short. The logger writes /makerwire.csv when a card is present.')
  }
  lines.push(...notes)
  lines.push('Review the wiring guide and measure voltages before applying power. Never work on mains wiring while energized.')
  return lines.join('\n\n')
}

export const uniqueLibraries = (libraries: string[]): string[] =>
  Array.from(new Set(libraries.filter(Boolean))).sort((a, b) => a.localeCompare(b))
