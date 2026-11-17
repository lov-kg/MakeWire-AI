import type { ComponentPin, NetKind, WarningSeverity } from '../types'

export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ')

export const uid = (prefix = 'id'): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

export const formatDate = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return 'just now'
  }
}

export const netColor: Record<NetKind, string> = {
  'power-3v3': '#fbbf24',
  'power-5v': '#fb7185',
  'power-dc': '#f97316',
  ground: '#94a3b8',
  i2c: '#38bdf8',
  spi: '#c084fc',
  uart: '#22d3ee',
  can: '#f59e0b',
  rs485: '#a3e635',
  ethernet: '#818cf8',
  i2s: '#e879f9',
  gpio: '#54e6b1',
  analog: '#fb923c',
  pwm: '#60a5fa',
}

export const severityRank: Record<WarningSeverity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
}

export const roleLabel: Record<ComponentPin['role'], string> = {
  power: 'Power',
  ground: 'Ground',
  'i2c-sda': 'I2C SDA',
  'i2c-scl': 'I2C SCL',
  'spi-sck': 'SPI SCK',
  'spi-mosi': 'SPI MOSI',
  'spi-miso': 'SPI MISO',
  'spi-cs': 'SPI CS',
  'uart-tx': 'UART TX',
  'uart-rx': 'UART RX',
  'can-tx': 'CAN TX',
  'can-rx': 'CAN RX',
  'can-h': 'CAN H',
  'can-l': 'CAN L',
  'rs485-a': 'RS-485 A',
  'rs485-b': 'RS-485 B',
  ethernet: 'Ethernet',
  'i2s-bclk': 'I2S BCLK',
  'i2s-lrck': 'I2S LRCK',
  'i2s-dout': 'I2S DOUT',
  'i2s-din': 'I2S DIN',
  analog: 'Analog',
  digital: 'GPIO',
  pwm: 'PWM',
  onewire: '1-Wire',
  bus: 'External bus',
  nc: 'No connect',
}

export const roleNet = (role: ComponentPin['role']): NetKind => {
  if (role === 'i2c-sda' || role === 'i2c-scl') return 'i2c'
  if (role.startsWith('spi-')) return 'spi'
  if (role.startsWith('uart-')) return 'uart'
  if (role.startsWith('can-')) return 'can'
  if (role.startsWith('rs485-')) return 'rs485'
  if (role === 'ethernet') return 'ethernet'
  if (role.startsWith('i2s-')) return 'i2s'
  if (role === 'analog') return 'analog'
  if (role === 'pwm') return 'pwm'
  if (role === 'power') return 'power-3v3'
  if (role === 'ground') return 'ground'
  return 'gpio'
}

export const roleConnectionLabel = (role: ComponentPin['role']): string => {
  switch (role) {
    case 'power':
      return 'Power'
    case 'ground':
      return 'Ground'
    case 'i2c-sda':
      return 'I2C SDA'
    case 'i2c-scl':
      return 'I2C SCL'
    case 'spi-sck':
      return 'SPI SCK'
    case 'spi-mosi':
      return 'SPI MOSI'
    case 'spi-miso':
      return 'SPI MISO'
    case 'spi-cs':
      return 'SPI CS'
    case 'uart-tx':
      return 'UART TX → RX'
    case 'uart-rx':
      return 'UART RX ← TX'
    case 'can-tx':
      return 'CAN TX → RX'
    case 'can-rx':
      return 'CAN RX ← TX'
    case 'can-h':
      return 'CAN H'
    case 'can-l':
      return 'CAN L'
    case 'rs485-a':
      return 'RS-485 A'
    case 'rs485-b':
      return 'RS-485 B'
    case 'ethernet':
      return 'Ethernet'
    case 'i2s-bclk':
      return 'I2S BCLK'
    case 'i2s-lrck':
      return 'I2S LRCK'
    case 'i2s-dout':
      return 'I2S DOUT'
    case 'i2s-din':
      return 'I2S DIN'
    case 'analog':
      return 'Analog'
    case 'pwm':
      return 'PWM'
    case 'onewire':
      return '1-Wire data'
    case 'bus':
      return 'External bus'
    default:
      return 'GPIO'
  }
}

export const downloadText = (filename: string, text: string, type = 'text/plain') => {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const copyToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

export const safeJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
