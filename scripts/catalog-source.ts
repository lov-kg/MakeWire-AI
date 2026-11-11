/**
 * Build-time catalogue source. Bundled with esbuild by scripts/export-catalog.mjs
 * so the Cloudflare Functions can serve the same registry data as the app
 * without shipping the TypeScript pack graph to the Workers runtime.
 */

import type { Board, ComponentDefinition } from '../src/types'
import { BOARDS } from '../src/data/boards'
import { COMPONENTS } from '../src/data/components'
import { esp32Boards } from '../src/catalog/boards/esp32'
import { arduinoBoards } from '../src/catalog/boards/arduino'
import { stm32Boards } from '../src/catalog/boards/stm32'
import { rp2040Boards } from '../src/catalog/boards/rp2040'
import { linuxBoards } from '../src/catalog/boards/linux'
import { industrialBoards } from '../src/catalog/boards/industrial'
import { roboticsBoards } from '../src/catalog/boards/robotics'
import { miscBoards } from '../src/catalog/boards/misc'
import { sensorComponents } from '../src/catalog/components/sensors'
import { industrialComponents } from '../src/catalog/components/industrial'
import { actuatorComponents } from '../src/catalog/components/actuators'
import { displayComponents } from '../src/catalog/components/displays'
import { connectivityComponents } from '../src/catalog/components/connectivity'
import { powerComponents } from '../src/catalog/components/power'
import { storageComponents } from '../src/catalog/components/storage'
import { inputComponents } from '../src/catalog/components/inputs'
import { cameraComponents } from '../src/catalog/components/cameras'
import { roboticsComponents } from '../src/catalog/components/robotics'

interface Pack<T> {
  id: string
  label: string
  description: string
  items: T[]
}

interface Duplicate {
  id: string
  kept: string
  skipped: string
}

const merge = <T extends { id: string }>(
  core: T[],
  packs: Pack<T>[],
): { items: T[]; duplicates: Duplicate[] } => {
  const map = new Map<string, T & { pack: string }>()
  const duplicates: Duplicate[] = []
  for (const item of core) map.set(item.id, { ...item, pack: 'core' })
  for (const pack of packs) {
    for (const item of pack.items) {
      const existing = map.get(item.id)
      if (existing) {
        duplicates.push({ id: item.id, kept: existing.pack, skipped: pack.id })
        continue
      }
      map.set(item.id, { ...item, pack: pack.id })
    }
  }
  return { items: Array.from(map.values()), duplicates }
}

const boardPackSources: Pack<Board>[] = [
  { id: 'esp32', label: 'Espressif ESP32', description: 'ESP32, S3, C3, C6 and ESP8266 devkits.', items: esp32Boards },
  { id: 'arduino', label: 'Arduino & AVR', description: 'Uno, Nano, Mega, Teensy and AVR boards.', items: arduinoBoards },
  { id: 'stm32', label: 'STM32', description: 'Blue Pill, Black Pill, Nucleo and Discovery boards.', items: stm32Boards },
  { id: 'rp2040', label: 'RP2040 & Pico', description: 'Pi Pico family and RP2040/RP2350 boards.', items: rp2040Boards },
  { id: 'linux', label: 'Linux SBC', description: 'Raspberry Pi, Jetson, Orange Pi and x86 SBCs.', items: linuxBoards },
  { id: 'industrial', label: 'Industrial & PLC', description: 'Siemens, Rockwell, Beckhoff, WAGO and field controllers.', items: industrialBoards },
  { id: 'robotics', label: 'Robotics controllers', description: 'Motion, AGV, drone and robot-arm controllers.', items: roboticsBoards },
  { id: 'misc', label: 'Other boards', description: 'nRF, FPGA, RISC-V, LoRa and specialty boards.', items: miscBoards },
]

const componentPackSources: Pack<ComponentDefinition>[] = [
  { id: 'sensors', label: 'Sensors', description: 'Environmental, motion, gas and current sensors.', items: sensorComponents },
  { id: 'industrial', label: 'Industrial I/O', description: 'PLC I/O, transmitters, relays and safety devices.', items: industrialComponents },
  { id: 'actuators', label: 'Actuators & motors', description: 'Servos, steppers, BLDC and motor drivers.', items: actuatorComponents },
  { id: 'displays', label: 'Displays', description: 'OLED, TFT, e-paper, LCD and HMI panels.', items: displayComponents },
  { id: 'connectivity', label: 'Connectivity', description: 'LTE, LoRa, Wi-Fi, Ethernet and fieldbus modules.', items: connectivityComponents },
  { id: 'power', label: 'Power', description: 'Regulators, converters, batteries and protection.', items: powerComponents },
  { id: 'storage', label: 'Storage', description: 'SD, eMMC, FRAM, EEPROM and flash.', items: storageComponents },
  { id: 'inputs', label: 'Inputs', description: 'Buttons, keypads, encoders and touch panels.', items: inputComponents },
  { id: 'cameras', label: 'Cameras', description: 'Camera, depth, thermal and machine vision.', items: cameraComponents },
  { id: 'robotics', label: 'Robotics', description: 'LiDAR, IMU, GPS, feedback and end effectors.', items: roboticsComponents },
]

const boardResult = merge(BOARDS, boardPackSources)
const componentResult = merge(COMPONENTS, componentPackSources)

export const boardCatalog = {
  version: 1,
  kind: 'boards',
  total: boardResult.items.length,
  packs: [
    { id: 'core', label: 'Starter boards', description: 'Hand-verified starter boards.', count: BOARDS.length },
    ...boardPackSources.map((pack) => ({
      id: pack.id,
      label: pack.label,
      description: pack.description,
      count: pack.items.length,
    })),
  ],
  duplicates: boardResult.duplicates,
  items: boardResult.items,
}

export const componentCatalog = {
  version: 1,
  kind: 'components',
  total: componentResult.items.length,
  packs: [
    { id: 'core', label: 'Starter modules', description: 'Hand-verified starter modules.', count: COMPONENTS.length },
    ...componentPackSources.map((pack) => ({
      id: pack.id,
      label: pack.label,
      description: pack.description,
      count: pack.items.length,
    })),
  ],
  duplicates: componentResult.duplicates,
  items: componentResult.items,
}
