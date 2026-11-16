/**
 * MakerWire AI catalogue registry.
 *
 * The core boards/components in `src/data` are registered synchronously so the
 * deterministic wiring and code engines can run immediately. The much larger
 * industrial packs are loaded lazily and merged in a deterministic order once
 * the workspace boots.
 *
 * Duplicate ids never throw: the first definition wins (core data beats packs,
 * earlier packs beat later ones) and the collision is recorded in
 * `catalogDiagnostics()` so it can be surfaced in developer tooling.
 */

import type { Board, ComponentDefinition } from '../types'
import { BOARDS } from '../data/boards'
import { COMPONENTS } from '../data/components'

export type CatalogKind = 'boards' | 'components'

export interface CatalogPack {
  id: string
  label: string
  description: string
  load: () => Promise<unknown[]>
}

interface CatalogDuplicate {
  kind: CatalogKind
  id: string
  kept: string
  skipped: string
}

export interface CatalogCounts {
  boards: number
  components: number
  boardPacks: number
  componentPacks: number
  boardsReady: boolean
  componentsReady: boolean
  duplicates: number
}

const boardMap = new Map<string, Board>()
const componentMap = new Map<string, ComponentDefinition>()
const duplicates: CatalogDuplicate[] = []

const boardPackState = new Map<string, boolean>()
const componentPackState = new Map<string, boolean>()

const registerBoard = (board: Board, pack: string, all: Map<string, Board>): void => {
  const existing = all.get(board.id)
  if (existing) {
    duplicates.push({ kind: 'boards', id: board.id, kept: existing.pack ?? 'core', skipped: pack })
    return
  }
  all.set(board.id, board.pack === pack ? board : { ...board, pack })
}

const registerComponent = (component: ComponentDefinition, pack: string, all: Map<string, ComponentDefinition>): void => {
  const existing = all.get(component.id)
  if (existing) {
    duplicates.push({ kind: 'components', id: component.id, kept: existing.pack ?? 'core', skipped: pack })
    return
  }
  all.set(component.id, component.pack === pack ? component : { ...component, pack })
}

// ---------------------------------------------------------------------------
// Core data is always available, even before hydration.
// ---------------------------------------------------------------------------

for (const board of BOARDS) registerBoard(board, 'core', boardMap)
for (const component of COMPONENTS) registerComponent(component, 'core', componentMap)
boardPackState.set('core', true)
componentPackState.set('core', true)

// ---------------------------------------------------------------------------
// Lazy industrial packs. Each dynamic import becomes its own Vite chunk.
// ---------------------------------------------------------------------------

const boardPackLoaders: CatalogPack[] = [
  {
    id: 'esp32',
    label: 'Espressif ESP32',
    description: 'ESP32, ESP32-S3, ESP32-C3/C6, ESP8266 and PSRAM devkits.',
    load: () => import('./boards/esp32').then((module) => module.esp32Boards),
  },
  {
    id: 'arduino',
    label: 'Arduino & AVR',
    description: 'Uno, Nano, Mega, Leonardo, Teensy and classic AVR boards.',
    load: () => import('./boards/arduino').then((module) => module.arduinoBoards),
  },
  {
    id: 'stm32',
    label: 'STM32',
    description: 'Blue Pill, Black Pill, Nucleo, Discovery and STM32 devkits.',
    load: () => import('./boards/stm32').then((module) => module.stm32Boards),
  },
  {
    id: 'rp2040',
    label: 'RP2040 & Pico',
    description: 'Raspberry Pi Pico family and RP2040/RP2350 boards.',
    load: () => import('./boards/rp2040').then((module) => module.rp2040Boards),
  },
  {
    id: 'linux',
    label: 'Linux SBC',
    description: 'Raspberry Pi, Jetson, Orange Pi, Rock Pi and x86 SBCs.',
    load: () => import('./boards/linux').then((module) => module.linuxBoards),
  },
  {
    id: 'industrial',
    label: 'Industrial & PLC',
    description: 'Siemens, Allen-Bradley, Beckhoff, WAGO, Phoenix and industrial controllers.',
    load: () => import('./boards/industrial').then((module) => module.industrialBoards),
  },
  {
    id: 'robotics',
    label: 'Robotics controllers',
    description: 'Robot arms, AGVs, drone flight controllers and motion controllers.',
    load: () => import('./boards/robotics').then((module) => module.roboticsBoards),
  },
  {
    id: 'misc',
    label: 'Other boards',
    description: 'Teensy, nRF, FPGA, RISC-V, LoRa and specialty controllers.',
    load: () => import('./boards/misc').then((module) => module.miscBoards),
  },
]

const componentPackLoaders: CatalogPack[] = [
  {
    id: 'sensors',
    label: 'Sensors',
    description: 'Environmental, motion, distance, gas, current and industrial sensors.',
    load: () => import('./components/sensors').then((module) => module.sensorComponents),
  },
  {
    id: 'industrial',
    label: 'Industrial I/O',
    description: 'PLC I/O, transmitters, signal conditioners, relays and safety devices.',
    load: () => import('./components/industrial').then((module) => module.industrialComponents),
  },
  {
    id: 'actuators',
    label: 'Actuators & motors',
    description: 'Servos, steppers, BLDC, solenoids, pneumatics and motor drivers.',
    load: () => import('./components/actuators').then((module) => module.actuatorComponents),
  },
  {
    id: 'displays',
    label: 'Displays',
    description: 'OLED, TFT, e-paper, LCD, HMI panels and LED matrices.',
    load: () => import('./components/displays').then((module) => module.displayComponents),
  },
  {
    id: 'connectivity',
    label: 'Connectivity',
    description: 'LTE, LoRa, Wi-Fi, BLE, Ethernet, CAN, RS-485 and fieldbus modules.',
    load: () => import('./components/connectivity').then((module) => module.connectivityComponents),
  },
  {
    id: 'power',
    label: 'Power',
    description: 'Regulators, DC-DC converters, battery packs, UPS and protection.',
    load: () => import('./components/power').then((module) => module.powerComponents),
  },
  {
    id: 'storage',
    label: 'Storage',
    description: 'SD cards, eMMC, FRAM, EEPROM, flash and NVMe.',
    load: () => import('./components/storage').then((module) => module.storageComponents),
  },
  {
    id: 'inputs',
    label: 'Inputs',
    description: 'Buttons, keypads, encoders, joysticks, switches and touch panels.',
    load: () => import('./components/inputs').then((module) => module.inputComponents),
  },
  {
    id: 'cameras',
    label: 'Cameras',
    description: 'Camera modules, depth cameras, thermal imagers and machine vision.',
    load: () => import('./components/cameras').then((module) => module.cameraComponents),
  },
  {
    id: 'robotics',
    label: 'Robotics',
    description: 'LiDAR, IMUs, GPS, motor feedback, end effectors and robot peripherals.',
    load: () => import('./components/robotics').then((module) => module.roboticsComponents),
  },
]

export const boardPacks: CatalogPack[] = [
  {
    id: 'core',
    label: 'Starter boards',
    description: 'Hand-verified starter boards that ship with the app.',
    load: async () => BOARDS,
  },
  ...boardPackLoaders,
]

export const componentPacks: CatalogPack[] = [
  {
    id: 'core',
    label: 'Starter modules',
    description: 'Hand-verified starter modules that ship with the app.',
    load: async () => COMPONENTS,
  },
  ...componentPackLoaders,
]

let boardsPromise: Promise<void> | null = null
let componentsPromise: Promise<void> | null = null

const loadBoardPacks = async (): Promise<void> => {
  const pending = boardPackLoaders.filter((pack) => !boardPackState.get(pack.id))
  const loaded = await Promise.all(pending.map((pack) => pack.load() as Promise<Board[]>))
  pending.forEach((pack, index) => {
    for (const board of loaded[index] ?? []) registerBoard(board, pack.id, boardMap)
    boardPackState.set(pack.id, true)
  })
}

const loadComponentPacks = async (): Promise<void> => {
  const pending = componentPackLoaders.filter((pack) => !componentPackState.get(pack.id))
  const loaded = await Promise.all(pending.map((pack) => pack.load() as Promise<ComponentDefinition[]>))
  pending.forEach((pack, index) => {
    for (const component of loaded[index] ?? []) registerComponent(component, pack.id, componentMap)
    componentPackState.set(pack.id, true)
  })
}

export const loadAllBoards = (): Promise<void> => {
  if (!boardsPromise) boardsPromise = loadBoardPacks()
  return boardsPromise
}

export const loadAllComponents = (): Promise<void> => {
  if (!componentsPromise) componentsPromise = loadComponentPacks()
  return componentsPromise
}

export const loadCatalog = async (): Promise<void> => {
  await Promise.all([loadAllBoards(), loadAllComponents()])
}

export const boardsReady = (): boolean => boardPackLoaders.every((pack) => boardPackState.get(pack.id))
export const componentsReady = (): boolean => componentPackLoaders.every((pack) => componentPackState.get(pack.id))

// ---------------------------------------------------------------------------
// Synchronous lookups and collections used by the deterministic engines.
// ---------------------------------------------------------------------------

export const getBoard = (id: string | null | undefined): Board | undefined =>
  id ? boardMap.get(id) : undefined

export const getComponent = (
  id: string,
  extra: ComponentDefinition[] = [],
): ComponentDefinition | undefined =>
  componentMap.get(id) ?? extra.find((component) => component.id === id)

export const allBoards = (): Board[] => Array.from(boardMap.values())
export const allComponents = (): ComponentDefinition[] => Array.from(componentMap.values())

export const boardGroups = (): string[] =>
  Array.from(new Set(allBoards().map((board) => board.family))).sort((a, b) => a.localeCompare(b))

export const componentCategories = (): string[] =>
  Array.from(new Set(allComponents().map((component) => component.category))).sort((a, b) => a.localeCompare(b))

export const boardSearchText = (board: Board): string =>
  [
    board.name,
    board.shortName,
    board.vendor,
    board.chip,
    board.family,
    board.description,
    board.formFactor,
    board.lifecycle ?? '',
    ...board.tags,
    ...board.interfaces,
    ...board.connectivity,
    ...(board.protocols ?? []),
    ...(board.standards ?? []),
    ...board.notes,
  ]
    .join(' ')
    .toLowerCase()

export const componentSearchText = (component: ComponentDefinition): string =>
  [
    component.name,
    component.shortName,
    component.category,
    component.description,
    component.manufacturer ?? '',
    component.i2cAddress ?? '',
    component.lifecycle ?? '',
    ...component.interfaces,
    ...component.tags,
    ...(component.protocols ?? []),
    ...(component.standards ?? []),
    ...(component.codeHints ?? []),
  ]
    .join(' ')
    .toLowerCase()

export const catalogCounts = (): CatalogCounts => ({
  boards: boardMap.size,
  components: componentMap.size,
  boardPacks: boardPacks.length,
  componentPacks: componentPacks.length,
  boardsReady: boardsReady(),
  componentsReady: componentsReady(),
  duplicates: duplicates.length,
})

export const catalogDiagnostics = (): CatalogDuplicate[] => [...duplicates]

export const packForBoard = (id: string): CatalogPack | undefined =>
  boardPacks.find((pack) => pack.id === (boardMap.get(id)?.pack ?? 'core'))

export const packForComponent = (id: string): CatalogPack | undefined =>
  componentPacks.find((pack) => pack.id === (componentMap.get(id)?.pack ?? 'core'))
