import type {
  Board,
  BoardPin,
  ComponentDefinition,
  ComponentPin,
  PinCapability,
  PinUsage,
  ProjectComponent,
  WiringConnection,
  WiringPlan,
  WiringWarning,
  WarningSeverity,
} from '../types'
import { getBoard, getComponent } from '../catalog/registry'
import { netColor, roleConnectionLabel } from './utils'

interface PreparedComponent {
  item: ProjectComponent
  def: ComponentDefinition
  label: string
  connections: WiringConnection[]
  selectedRailId?: string
}

interface FindOptions {
  allowInputOnly?: boolean
  exclude?: Set<string>
}

const emptyPlan = (boardId: string, warning?: WiringWarning): WiringPlan => ({
  boardId,
  connections: [],
  warnings: warning ? [warning] : [],
  guides: [],
  pinUsage: [],
  powerRails: [],
  unconnected: [],
  stats: { connections: 0, signals: 0, components: 0, usedBoardPins: 0 },
  status: 'blocked',
  generatedAt: new Date().toISOString(),
})

const capsForRole = (role: ComponentPin['role']): PinCapability[] => {
  switch (role) {
    case 'i2c-sda':
      return ['i2c-sda']
    case 'i2c-scl':
      return ['i2c-scl']
    case 'spi-sck':
      return ['spi-sck']
    case 'spi-mosi':
      return ['spi-mosi']
    case 'spi-miso':
      return ['spi-miso']
    case 'spi-cs':
      return ['spi-cs', 'gpio']
    case 'uart-tx':
      return ['uart-rx', 'gpio']
    case 'uart-rx':
      return ['uart-tx', 'gpio']
    case 'can-tx':
      return ['can-tx', 'gpio']
    case 'can-rx':
      return ['can-rx', 'gpio']
    case 'can-h':
      return ['can-h']
    case 'can-l':
      return ['can-l']
    case 'rs485-a':
      return ['rs485-a']
    case 'rs485-b':
      return ['rs485-b']
    case 'ethernet':
      return ['ethernet', 'gpio']
    case 'i2s-bclk':
      return ['i2s-bclk', 'pwm', 'gpio']
    case 'i2s-lrck':
      return ['i2s-lrck', 'pwm', 'gpio']
    case 'i2s-dout':
      return ['i2s-dout', 'gpio']
    case 'i2s-din':
      return ['i2s-din', 'gpio']
    case 'analog':
      return ['adc', 'gpio']
    case 'pwm':
      return ['pwm', 'gpio']
    default:
      return ['gpio']
  }
}

const railNet = (voltage: number): WiringConnection['net'] =>
  voltage === 5 ? 'power-5v' : voltage === 3.3 ? 'power-3v3' : 'power-dc'

const netForRole = (role: ComponentPin['role'], railVoltage?: number): WiringConnection['net'] => {
  if (role === 'power') return railNet(railVoltage ?? 3.3)
  if (role === 'ground') return 'ground'
  if (role === 'i2c-sda' || role === 'i2c-scl') return 'i2c'
  if (role.startsWith('spi-')) return 'spi'
  if (role.startsWith('uart-')) return 'uart'
  if (role.startsWith('can-')) return 'can'
  if (role.startsWith('rs485-')) return 'rs485'
  if (role === 'ethernet') return 'ethernet'
  if (role.startsWith('i2s-')) return 'i2s'
  if (role === 'analog') return 'analog'
  if (role === 'pwm') return 'pwm'
  return 'gpio'
}

const normalizeAddress = (value?: string): string | null => {
  if (!value) return null
  const match = value.match(/0x[0-9a-f]+/i)
  return match ? match[0].toLowerCase() : null
}

export function generateWiring(
  boardId: string | null,
  projectComponents: ProjectComponent[],
  customComponents: ComponentDefinition[] = [],
): WiringPlan {
  const board = getBoard(boardId)
  if (!board) {
    return emptyPlan(boardId ?? '', {
      id: 'no-board',
      severity: 'danger',
      title: 'No board selected',
      detail: 'Choose a development board before generating a wiring plan.',
    })
  }

  if (projectComponents.length === 0) {
    return {
      ...emptyPlan(board.id),
      status: 'ready',
    }
  }

  const warnings: WiringWarning[] = []
  const warningKeys = new Set<string>()
  const addWarning = (
    key: string,
    severity: WarningSeverity,
    title: string,
    detail: string,
    componentInstanceId?: string,
  ) => {
    if (warningKeys.has(key)) return
    warningKeys.add(key)
    warnings.push({ id: key, severity, title, detail, componentInstanceId })
  }

  const boardPinById = new Map(board.pins.map((pin) => [pin.id, pin]))
  const powerPinById = new Map(board.powerPins.map((pin) => [pin.id, pin]))
  const usedPinIds = new Set<string>()
  const gauge = new Map<string, { currentMa: number; count: number }>()
  const addressMap = new Map<string, { label: string; instanceId: string }>()
  const unconnected: WiringPlan['unconnected'] = []

  const idCounts = new Map<string, number>()
  const prepared: PreparedComponent[] = []

  for (const item of projectComponents) {
    const def = getComponent(item.componentId, customComponents)
    if (!def) {
      addWarning(
        `missing-${item.instanceId}`,
        'danger',
        'Unknown component definition',
        `Component “${item.componentId}” is not in the local library or custom component cache. Remove it and add it again.`,
        item.instanceId,
      )
      continue
    }

    const count = (idCounts.get(def.id) ?? 0) + 1
    idCounts.set(def.id, count)
    const label = `${def.shortName}${count > 1 ? ` #${count}` : ''}${
      item.quantity > 1 ? ` ×${item.quantity}` : ''
    }`
    prepared.push({ item, def, label, connections: [] })
  }

  if (prepared.length === 0) {
    return {
      ...emptyPlan(board.id),
      warnings,
    }
  }

  const findPin = (
    caps: PinCapability[],
    preferredId?: string,
    options: FindOptions = {},
  ): BoardPin | null => {
    const isAvailable = (pin: BoardPin) =>
      !usedPinIds.has(pin.id) &&
      !pin.restricted &&
      !options.exclude?.has(pin.id) &&
      (options.allowInputOnly || !pin.inputOnly) &&
      caps.some((cap) => pin.caps.includes(cap))

    if (preferredId) {
      const preferred = boardPinById.get(preferredId)
      if (preferred && isAvailable(preferred)) return preferred
    }

    for (const cap of caps) {
      const found = board.pins.find((pin) => pin.caps.includes(cap) && isAvailable(pin))
      if (found) return found
    }

    if (!options.allowInputOnly) {
      const outputPin = board.pins.find(
        (pin) =>
          pin.caps.includes('gpio') &&
          !pin.inputOnly &&
          !usedPinIds.has(pin.id) &&
          !pin.restricted &&
          !options.exclude?.has(pin.id),
      )
      if (outputPin) return outputPin
    }

    return null
  }

  const addConnection = (
    component: PreparedComponent,
    componentPin: ComponentPin,
    boardPinLabel: string,
    boardPinCode: string,
    boardPinId: string,
    boardPinKind: WiringConnection['boardPinKind'],
    options: {
      railVoltage?: number
      note?: string
      netLabel?: string
    } = {},
  ) => {
    const connection: WiringConnection = {
      id: `${component.item.instanceId}:${componentPin.id}`,
      boardPinId,
      boardPinLabel,
      boardPinCode,
      boardPinKind,
      componentInstanceId: component.item.instanceId,
      componentId: component.def.id,
      componentLabel: component.label,
      componentPinId: componentPin.id,
      componentPinLabel: componentPin.label,
      role: componentPin.role,
      net: netForRole(componentPin.role, options.railVoltage),
      netLabel:
        options.netLabel ??
        (componentPin.role === 'power'
          ? `${options.railVoltage ?? 3.3} V`
          : componentPin.role === 'ground'
            ? 'GND'
            : roleConnectionLabel(componentPin.role)),
      note: options.note ?? componentPin.note,
    }
    component.connections.push(connection)
  }

  // ── Pass 1: power, ground, safety review ────────────────────────────────
  const groundRail = board.powerPins.find((pin) => pin.voltage === 0)

  for (const component of prepared) {
    const { def, item } = component

    const highVoltageOutput = (def.outputVoltage ?? 0) >= 12 || def.logicVoltage >= 12

    if (board.logicVoltage < 12 && highVoltageOutput) {
      addWarning(
        `hv-out-${item.instanceId}`,
        'danger',
        'High-voltage output on low-voltage logic',
        `${component.label} operates at ${def.outputVoltage && def.outputVoltage >= 12 ? `${def.outputVoltage} V` : `${def.logicVoltage} V`}. Never connect its output directly to a ${board.logicVoltage} V GPIO. Use an opto-isolated input, a relay, or a level shifter rated for the field voltage, and keep field and logic grounds isolated where the module allows it.`,
        item.instanceId,
      )
    } else if (board.logicVoltage < 5 && def.outputs5v) {
      addWarning(
        `logic-out-${item.instanceId}`,
        'danger',
        '5 V output on a 3.3 V board',
        `${component.label} can drive 5 V on its outputs. ${board.name} GPIOs are not 5 V tolerant. Use a level shifter or resistor divider before connecting any module output to the board.`,
        item.instanceId,
      )
    } else if (board.logicVoltage === 5 && def.logicVoltage < 4.5 && !def.fiveVoltTolerant) {
      addWarning(
        `logic-in-${item.instanceId}`,
        'danger',
        '5 V logic into a 3.3 V module',
        `${board.name} drives 5 V logic, but ${component.label} is specified for ${def.logicVoltage} V logic and is not marked 5 V tolerant. Level-shift the board TX/SDA/SCK and GPIO outputs before they reach the module.`,
        item.instanceId,
      )
    } else if (board.logicVoltage < 5 && def.logicVoltage > board.logicVoltage + 0.2 && def.logicVoltage < 12) {
      addWarning(
        `logic-high-${item.instanceId}`,
        'warning',
        'Logic level mismatch',
        `${component.label} expects ${def.logicVoltage} V logic. A ${board.logicVoltage} V high may not reliably register, and its own outputs may exceed the board's input rating. Verify the module and add a level shifter if needed.`,
        item.instanceId,
      )
    }

    if (def.requiresExternalSupply) {
      addWarning(
        `external-${item.instanceId}`,
        'warning',
        'External supply required',
        `${component.label} should not be powered from the development board's regulator. ${def.safety[0] ?? 'Use a suitably rated external supply and join the grounds.'}`,
        item.instanceId,
      )
    }

    if (def.id === 'ov2640-dvp') {
      addWarning(
        `camera-${item.instanceId}`,
        'warning',
        'DVP camera needs a camera-capable peripheral',
        'The pin matrix is a reference only. OV2640 uses a parallel DVP bus that must map to a hardware camera peripheral (for example ESP32-S3 LCD_CAM) with short, matched wiring. Generic GPIO firmware will not capture frames.',
        item.instanceId,
      )
    }

    const address = normalizeAddress(def.i2cAddress)
    if (address) {
      const existing = addressMap.get(address)
      if (existing) {
        addWarning(
          `i2c-address-${address}-${item.instanceId}`,
          'danger',
          'I2C address collision',
          `${component.label} and ${existing.label} both default to ${address}. Reconfigure one device to a different address, or use a separate I2C bus / multiplexer.`,
          item.instanceId,
        )
      } else {
        addressMap.set(address, { label: component.label, instanceId: item.instanceId })
      }
    }

    if (item.quantity > 1 && address) {
      addWarning(
        `i2c-qty-${item.instanceId}`,
        'warning',
        'Multiple devices on one address',
        `${component.label} contains ${item.quantity} devices that share the I2C address ${address}. Each device must be reconfigured or placed behind a bus multiplexer.`,
        item.instanceId,
      )
    }

    const override = item.powerOverride
    const overrideVoltage = override === 'auto' ? null : Number(override)
    const desiredVoltage =
      overrideVoltage ??
      (def.voltage.typical >= 12 ? def.voltage.typical : def.voltage.typical >= 4.5 ? 5 : 3.3)

    const availableRails = board.powerPins.filter((pin) => pin.voltage > 0 && pin.maxCurrentMa > 0)
    let rail = availableRails.find((pin) => Math.abs(pin.voltage - desiredVoltage) < 0.05)

    if (!rail) {
      const inRange = availableRails
        .filter((pin) => pin.voltage >= def.voltage.min - 0.1 && pin.voltage <= def.voltage.max + 0.1)
        .sort((a, b) => Math.abs(a.voltage - desiredVoltage) - Math.abs(b.voltage - desiredVoltage))
      if (inRange.length > 0) {
        rail = inRange[0]
        if (overrideVoltage === null) {
          addWarning(
            `rail-fallback-${item.instanceId}`,
            'warning',
            'Power rail fallback',
            `${component.label} requested ${desiredVoltage} V, but ${board.name} does not expose that exact rail. ${rail.label} (${rail.voltage} V) was selected instead — verify the module accepts it.`,
            item.instanceId,
          )
        }
      }
    }

    if (!rail) {
      addWarning(
        `rail-missing-${item.instanceId}`,
        'danger',
        'No suitable power rail',
        `${board.name} cannot supply the voltage requested by ${component.label}. Power the module externally and connect a common ground.`,
        item.instanceId,
      )
      for (const pin of def.pins.filter((candidate) => candidate.role === 'power' && candidate.required !== false)) {
        unconnected.push({ componentLabel: component.label, pinLabel: pin.label, reason: 'No suitable board power rail.' })
      }
    } else {
      component.selectedRailId = rail.id
      const safetyMargin = rail.maxCurrentMa
      if (rail.maxCurrentMa > 0) {
        const load = gauge.get(rail.id) ?? { currentMa: 0, count: 0 }
        load.currentMa += def.current.typicalMa * item.quantity
        load.count += item.quantity
        gauge.set(rail.id, load)

        if (def.current.peakMa && def.current.peakMa > safetyMargin * 0.9) {
          addWarning(
            `peak-${item.instanceId}`,
            'warning',
            'Peak current exceeds board rail',
            `${component.label} can peak at ${def.current.peakMa} mA, above the ${safetyMargin} mA budget of the ${rail.label} pin. Use a dedicated supply with a common ground.`,
            item.instanceId,
          )
        }
      }

      if (rail.voltage < def.voltage.min - 0.1) {
        addWarning(
          `under-voltage-${item.instanceId}`,
          'danger',
          'Supply voltage too low',
          `${component.label} needs at least ${def.voltage.min} V, but ${rail.label} provides ${rail.voltage} V. Choose a different rail or use an external supply.`,
          item.instanceId,
        )
      }
      if (rail.voltage > def.voltage.max + 0.1) {
        addWarning(
          `over-voltage-${item.instanceId}`,
          'danger',
          'Supply voltage too high',
          `${component.label} is rated to ${def.voltage.max} V, but ${rail.label} provides ${rail.voltage} V. This can permanently damage the module.`,
          item.instanceId,
        )
      }

      if (overrideVoltage !== null && Math.abs(rail.voltage - overrideVoltage) > 0.05) {
        addWarning(
          `override-fallback-${item.instanceId}`,
          'warning',
          'Power override not available',
          `You requested ${overrideVoltage} V for ${component.label}; the wiring uses ${rail.label} (${rail.voltage} V) instead.`,
          item.instanceId,
        )
      }

      for (const pin of def.pins.filter((candidate) => candidate.role === 'power' && candidate.required !== false)) {
        addConnection(component, pin, rail.label, rail.label, rail.id, 'power', {
          railVoltage: rail.voltage,
          netLabel: rail.label,
          note: pin.note,
        })
      }
    }

    if (groundRail) {
      for (const pin of def.pins.filter((candidate) => candidate.role === 'ground' && candidate.required !== false)) {
        addConnection(component, pin, groundRail.label, groundRail.label, groundRail.id, 'ground', {
          netLabel: 'GND',
          note: pin.note,
        })
      }
    } else {
      addWarning(
        `no-ground-${item.instanceId}`,
        'danger',
        'No ground pin found',
        `${board.name} does not expose a ground pin in the board definition.`,
        item.instanceId,
      )
    }
  }

  // ── Pass 2: shared I2C bus ─────────────────────────────────────────────
  const i2cComponents = prepared.filter((component) =>
    component.def.pins.some((pin) => pin.role === 'i2c-sda' || pin.role === 'i2c-scl'),
  )

  if (i2cComponents.length > 0) {
    const sda = findPin(['i2c-sda'], board.defaults.i2cSda, { allowInputOnly: true })
    const scl = findPin(['i2c-scl'], board.defaults.i2cScl, {
      allowInputOnly: true,
      exclude: new Set(sda ? [sda.id] : []),
    })

    if (sda && scl) {
      usedPinIds.add(sda.id)
      usedPinIds.add(scl.id)
      for (const component of i2cComponents) {
        for (const pin of component.def.pins.filter(
          (candidate) =>
            (candidate.role === 'i2c-sda' || candidate.role === 'i2c-scl') && candidate.required !== false,
        )) {
          addConnection(
            component,
            pin,
            pin.role === 'i2c-sda' ? sda.label : scl.label,
            pin.role === 'i2c-sda' ? sda.pinCode : scl.pinCode,
            pin.role === 'i2c-sda' ? sda.id : scl.id,
            'gpio',
            { netLabel: pin.role === 'i2c-sda' ? 'I2C SDA' : 'I2C SCL' },
          )
        }
      }
    } else {
      addWarning(
        'i2c-pins',
        'danger',
        'I2C pins unavailable',
        `Could not find two free GPIOs with I2C capability on ${board.name}. Remove another I2C device or free the bus pins.`,
      )
      for (const component of i2cComponents) {
        for (const pin of component.def.pins.filter(
          (candidate) =>
            (candidate.role === 'i2c-sda' || candidate.role === 'i2c-scl') && candidate.required !== false,
        )) {
          unconnected.push({
            componentLabel: component.label,
            pinLabel: pin.label,
            reason: 'No free I2C-capable pins.',
          })
        }
      }
    }
  }

  // ── Pass 2b: shared CAN transceiver pair ──────────────────────────────
  const canComponents = prepared.filter((component) =>
    component.def.pins.some((pin) => pin.role === 'can-tx' || pin.role === 'can-rx'),
  )

  if (canComponents.length > 0) {
    let canTx = findPin(['can-tx'])
    let canRx = findPin(['can-rx'], undefined, { exclude: new Set(canTx ? [canTx.id] : []) })
    let softwareCan = false

    if (!canTx) {
      canTx = findPin(['gpio'])
      softwareCan = true
    }
    if (!canRx) {
      canRx = findPin(['gpio'], undefined, { exclude: new Set(canTx ? [canTx.id] : []) })
      softwareCan = true
    }

    if (softwareCan) {
      addWarning(
        'can-soft',
        'warning',
        'CAN needs a controller or external transceiver',
        `${board.name} does not expose a native CAN peripheral on the selected pins. The plan falls back to GPIOs; use an SPI CAN controller (MCP2515) or a board with a TWAI/FDCAN peripheral, and verify the bit timing in firmware.`,
      )
    }

    if (canTx && canRx) {
      usedPinIds.add(canTx.id)
      usedPinIds.add(canRx.id)
      for (const component of canComponents) {
        for (const pin of component.def.pins.filter(
          (candidate) => (candidate.role === 'can-tx' || candidate.role === 'can-rx') && candidate.required !== false,
        )) {
          const target = pin.role === 'can-tx' ? canTx : canRx
          addConnection(component, pin, target.label, target.pinCode, target.id, 'gpio', {
            netLabel: roleConnectionLabel(pin.role),
            note: pin.note,
          })
        }
      }
    } else {
      addWarning(
        'can-pins',
        'danger',
        'CAN pins unavailable',
        `Could not free two GPIOs for the CAN transceiver on ${board.name}. Remove another device or choose a board with a CAN peripheral.`,
      )
      for (const component of canComponents) {
        for (const pin of component.def.pins.filter(
          (candidate) => (candidate.role === 'can-tx' || candidate.role === 'can-rx') && candidate.required !== false,
        )) {
          unconnected.push({ componentLabel: component.label, pinLabel: pin.label, reason: 'No free CAN-capable pins.' })
        }
      }
    }
  }

  // ── Pass 2c: shared I2S bus ────────────────────────────────────────────
  const i2sRoles = new Set<ComponentPin['role']>(['i2s-bclk', 'i2s-lrck', 'i2s-dout', 'i2s-din'])
  const i2sComponents = prepared.filter((component) =>
    component.def.pins.some((pin) => i2sRoles.has(pin.role)),
  )

  if (i2sComponents.length > 0) {
    const bclk = findPin(['i2s-bclk', 'pwm', 'gpio'])
    const lrck = findPin(['i2s-lrck', 'pwm', 'gpio'], undefined, {
      exclude: new Set(bclk ? [bclk.id] : []),
    })
    const dout = findPin(['i2s-dout', 'gpio'], undefined, {
      exclude: new Set([bclk?.id, lrck?.id].filter(Boolean) as string[]),
    })
    const din = findPin(['i2s-din', 'gpio'], undefined, {
      exclude: new Set([bclk?.id, lrck?.id, dout?.id].filter(Boolean) as string[]),
    })
    const shared = { 'i2s-bclk': bclk, 'i2s-lrck': lrck, 'i2s-dout': dout, 'i2s-din': din }
    for (const pin of Object.values(shared)) {
      if (pin) usedPinIds.add(pin.id)
    }

    for (const component of i2sComponents) {
      for (const pin of component.def.pins.filter(
        (candidate) => i2sRoles.has(candidate.role) && candidate.required !== false,
      )) {
        const target = shared[pin.role as keyof typeof shared]
        if (target) {
          addConnection(component, pin, target.label, target.pinCode, target.id, 'gpio', {
            netLabel: roleConnectionLabel(pin.role),
            note: pin.note,
          })
        } else {
          unconnected.push({ componentLabel: component.label, pinLabel: pin.label, reason: 'No free I2S-capable pin.' })
          addWarning(
            `i2s-pins-${component.item.instanceId}-${pin.id}`,
            'danger',
            'I2S pin unavailable',
            `${component.label} needs ${pin.label}, but no free I2S-capable pin remains on ${board.name}.`,
            component.item.instanceId,
          )
        }
      }
    }
  }

  // ── Pass 2d: field bus trunks (CAN / RS-485) ───────────────────────────
  // CAN H/L and RS-485 A/B are trunk terminals, not board GPIOs. Wire them to
  // the board only when it exposes native field-bus pins; otherwise explain
  // exactly what interface, termination and reference the plan still needs.
  const fieldbusGroups: Array<{
    key: 'can' | 'rs485'
    label: string
    roles: Array<ComponentPin['role']>
    needs: string
    note: string
  }> = [
    {
      key: 'can',
      label: 'CAN',
      roles: ['can-h', 'can-l'],
      needs:
        'a CAN transceiver or a controller with a TWAI/FDCAN peripheral, 120 Ω termination at both trunk ends, and a common reference',
      note: 'CAN trunk terminal. Use a twisted pair and keep the stub short.',
    },
    {
      key: 'rs485',
      label: 'RS-485',
      roles: ['rs485-a', 'rs485-b'],
      needs:
        'an RS-485 transceiver or communication module (for example a CM 1241 on an S7-1200, a MAX485 TTL module, or a USB-RS485 adapter), 120 Ω termination at both trunk ends, and a common reference',
      note: 'RS-485 trunk terminal. Use a twisted pair, match A/B polarity and keep the stub short.',
    },
  ]

  for (const group of fieldbusGroups) {
    const nodes = prepared.filter((component) =>
      component.def.pins.some((pin) => group.roles.includes(pin.role)),
    )
    if (nodes.length === 0) continue

    const available = group.roles
      .map((role) => ({
        role,
        pin:
          board.pins.find(
            (candidate) => candidate.caps.includes(role as PinCapability) && !usedPinIds.has(candidate.id),
          ) ?? null,
      }))
      .filter((entry): entry is { role: ComponentPin['role']; pin: BoardPin } => Boolean(entry.pin))

    if (available.length > 0) {
      for (const entry of available) usedPinIds.add(entry.pin.id)
      for (const component of nodes) {
        for (const pin of component.def.pins.filter((candidate) => group.roles.includes(candidate.role))) {
          const target = available.find((entry) => entry.role === pin.role)?.pin
          if (!target) continue
          addConnection(component, pin, target.label, target.pinCode, target.id, 'gpio', {
            netLabel: roleConnectionLabel(pin.role),
            note: pin.note ?? group.note,
          })
        }
      }
      addWarning(
        `fieldbus-${group.key}`,
        'info',
        `${group.label} trunk shared`,
        `${nodes.map((component) => component.label).join(', ')} share the ${group.label} trunk on ${board.name}. Terminate both trunk ends and keep the common reference intact.`,
      )
    } else {
      addWarning(
        `fieldbus-${group.key}`,
        'warning',
        `${group.label} field bus needs an interface`,
        `${board.name} has no ${group.label} terminals, so the ${group.label} side of ${nodes
          .map((component) => component.label)
          .join(', ')} is not wired to the controller. Add ${group.needs}.`,
      )
    }
  }

  // ── Pass 3: shared SPI bus + per-device CS ─────────────────────────────
  const spiComponents = prepared.filter((component) =>
    component.def.pins.some((pin) => pin.role.startsWith('spi-')),
  )

  if (spiComponents.length > 0) {
    const spiSck = findPin(['spi-sck'], board.defaults.spiSck)
    const spiMosi = findPin(['spi-mosi'], board.defaults.spiMosi, {
      exclude: new Set(spiSck ? [spiSck.id] : []),
    })
    const spiMiso = findPin(['spi-miso'], board.defaults.spiMiso, {
      exclude: new Set([spiSck?.id, spiMosi?.id].filter(Boolean) as string[]),
    })
    const sharedPin = { sck: spiSck, mosi: spiMosi, miso: spiMiso }
    for (const pin of Object.values(sharedPin)) {
      if (pin) usedPinIds.add(pin.id)
    }

    for (const component of spiComponents) {
      for (const pin of component.def.pins.filter(
        (candidate) => candidate.role.startsWith('spi-') && candidate.required !== false,
      )) {
        let boardPin: BoardPin | null = null
        if (pin.role === 'spi-sck') boardPin = sharedPin.sck
        else if (pin.role === 'spi-mosi') boardPin = sharedPin.mosi
        else if (pin.role === 'spi-miso') boardPin = sharedPin.miso
        else if (pin.role === 'spi-cs') {
          boardPin = findPin(['spi-cs', 'gpio'], undefined)
          if (boardPin) usedPinIds.add(boardPin.id)
        }

        if (boardPin) {
          addConnection(
            component,
            pin,
            boardPin.label,
            boardPin.pinCode,
            boardPin.id,
            'gpio',
            { netLabel: roleConnectionLabel(pin.role) },
          )
        } else {
          unconnected.push({
            componentLabel: component.label,
            pinLabel: pin.label,
            reason: 'No free SPI-capable pin.',
          })
          addWarning(
            `spi-pins-${component.item.instanceId}-${pin.id}`,
            'danger',
            'SPI pin unavailable',
            `${component.label} needs ${pin.label}, but no free SPI-capable pin remains on ${board.name}.`,
            component.item.instanceId,
          )
        }
      }
    }
  }

  // ── Pass 4: UART (one pair per device) ─────────────────────────────────
  const uartComponents = prepared.filter((component) =>
    component.def.pins.some((pin) => pin.role === 'uart-tx' || pin.role === 'uart-rx'),
  )

  for (const component of uartComponents) {
    const txPin = component.def.pins.find((pin) => pin.role === 'uart-tx' && pin.required !== false)
    const rxPin = component.def.pins.find((pin) => pin.role === 'uart-rx' && pin.required !== false)
    let boardRx: BoardPin | null = null
    let boardTx: BoardPin | null = null
    let hardware = true

    if (txPin) {
      boardRx = findPin(['uart-rx'], board.defaults.uartRx)
      if (boardRx) usedPinIds.add(boardRx.id)
    }
    if (rxPin) {
      boardTx = findPin(['uart-tx'], board.defaults.uartTx, {
        exclude: new Set(boardRx ? [boardRx.id] : []),
      })
      if (boardTx) usedPinIds.add(boardTx.id)
    }

    if (txPin && !boardRx) {
      hardware = false
      boardRx = findPin(['gpio'], undefined, { allowInputOnly: true })
      if (boardRx) usedPinIds.add(boardRx.id)
    }
    if (rxPin && !boardTx) {
      hardware = false
      boardTx = findPin(['gpio'], undefined, {
        exclude: new Set(boardRx ? [boardRx.id] : []),
      })
      if (boardTx) usedPinIds.add(boardTx.id)
    }

    if (!hardware) {
      addWarning(
        `uart-soft-${component.item.instanceId}`,
        'warning',
        'UART needs a custom pin mapping',
        `${component.label} uses UART pins that are not the board's default hardware UART. Configure the board's GPIO matrix (ESP32) or use SoftwareSerial, and verify the pin mapping in the generated code.`,
        component.item.instanceId,
      )
    }

    if (txPin) {
      if (boardRx) {
        addConnection(component, txPin, boardRx.label, boardRx.pinCode, boardRx.id, 'gpio', {
          netLabel: 'UART TX → RX',
          note: 'Module TX crosses to board RX.',
        })
      } else {
        unconnected.push({ componentLabel: component.label, pinLabel: txPin.label, reason: 'No free UART RX pin.' })
      }
    }

    if (rxPin) {
      if (boardTx) {
        addConnection(component, rxPin, boardTx.label, boardTx.pinCode, boardTx.id, 'gpio', {
          netLabel: 'UART RX ← TX',
          note: 'Module RX crosses to board TX.',
        })
      } else {
        unconnected.push({ componentLabel: component.label, pinLabel: rxPin.label, reason: 'No free UART TX pin.' })
      }
    }
  }

  // ── Pass 5: remaining single-purpose pins ──────────────────────────────
  const handledRoles = new Set<ComponentPin['role']>([
    'power',
    'ground',
    'nc',
    'i2c-sda',
    'i2c-scl',
    'spi-sck',
    'spi-mosi',
    'spi-miso',
    'spi-cs',
    'uart-tx',
    'uart-rx',
    'can-tx',
    'can-rx',
    'can-h',
    'can-l',
    'i2s-bclk',
    'i2s-lrck',
    'i2s-dout',
    'i2s-din',
  ])

  for (const component of prepared) {
    for (const pin of component.def.pins.filter(
      (candidate) => !handledRoles.has(candidate.role) && candidate.required !== false,
    )) {
      let boardPin: BoardPin | null = null
      const caps = capsForRole(pin.role)

      if (pin.role === 'analog') {
        boardPin = findPin(caps, undefined, { allowInputOnly: true })
      } else if (pin.role === 'digital' && pin.direction === 'in') {
        boardPin = findPin(caps, undefined, { allowInputOnly: true })
      } else {
        boardPin = findPin(caps, undefined)
      }

      if (!boardPin) {
        unconnected.push({
          componentLabel: component.label,
          pinLabel: pin.label,
          reason: 'No compatible free board pin.',
        })
        addWarning(
          `pin-missing-${component.item.instanceId}-${pin.id}`,
          'danger',
          'Pin allocation failed',
          `${component.label} needs ${pin.label}, but no compatible free pin remains on ${board.name}. Reduce the component count or choose a board with more GPIO.`,
          component.item.instanceId,
        )
        continue
      }

      usedPinIds.add(boardPin.id)
      const note =
        pin.role === 'onewire'
          ? 'Add a pull-up resistor from DATA to VCC if the breakout does not include one.'
          : pin.role === 'analog' && defNeedsAdcWarning(component.def)
            ? 'Confirm the module output never exceeds the board ADC reference voltage.'
            : pin.role === 'rs485-a' || pin.role === 'rs485-b'
              ? 'Use a twisted pair, keep the stub short and fit 120 Ω termination at each end of the trunk.'
              : pin.role === 'ethernet'
                ? 'Verify the RMII/PHY pin mapping against the board schematic; generic GPIO firmware will not bring up Ethernet.'
                : pin.note
      addConnection(component, pin, boardPin.label, boardPin.pinCode, boardPin.id, 'gpio', {
        netLabel: roleConnectionLabel(pin.role),
        note,
      })
    }
  }

  // ── Pass 6: rail totals & status ───────────────────────────────────────
  const powerRails: WiringPlan['powerRails'] = []
  for (const [railId, load] of gauge) {
    const rail = powerPinById.get(railId)
    if (!rail) continue
    powerRails.push({
      rail: rail.label,
      voltage: rail.voltage,
      currentMa: Math.round(load.currentMa),
      capacityMa: rail.maxCurrentMa,
    })
    const utilization = rail.maxCurrentMa > 0 ? load.currentMa / rail.maxCurrentMa : 0
    if (utilization > 1) {
      addWarning(
        `rail-over-${railId}`,
        'danger',
        `${rail.label} rail is overloaded`,
        `Estimated continuous load is ${Math.round(load.currentMa)} mA, above the ${rail.maxCurrentMa} mA board budget. Use an external supply and common ground.`,
      )
    } else if (utilization > 0.8) {
      addWarning(
        `rail-near-${railId}`,
        'warning',
        `${rail.label} rail is near its limit`,
        `Estimated continuous load is ${Math.round(load.currentMa)} mA of a ${rail.maxCurrentMa} mA budget. Leave headroom for start-up and radio peaks.`,
      )
    }
  }

  for (const component of prepared) {
    const guide = {
      instanceId: component.item.instanceId,
      componentId: component.def.id,
      componentLabel: component.label,
      connections: component.connections,
      safety: component.def.safety,
    }
    // Mutating the prepared object keeps guide references in one place.
    ;(component as PreparedComponent & { guide?: typeof guide }).guide = guide
  }

  const guides: WiringPlan['guides'] = prepared.map((component) => ({
    instanceId: component.item.instanceId,
    componentId: component.def.id,
    componentLabel: component.label,
    connections: component.connections,
    safety: component.def.safety,
  }))

  const usageMap = new Map<string, PinUsage>()
  for (const connection of connectionsOf(prepared)) {
    if (connection.boardPinKind === 'power' && connection.role !== 'power') continue
    const existing = usageMap.get(connection.boardPinId)
    if (existing) {
      if (!existing.nets.includes(connection.netLabel)) existing.nets.push(connection.netLabel)
      if (!existing.componentLabels.includes(connection.componentLabel)) {
        existing.componentLabels.push(connection.componentLabel)
      }
    } else {
      usageMap.set(connection.boardPinId, {
        boardPinId: connection.boardPinId,
        label: connection.boardPinLabel,
        kind: connection.boardPinKind,
        nets: [connection.netLabel],
        componentLabels: [connection.componentLabel],
      })
    }
  }

  const pinOrder = new Map<string, number>()
  board.powerPins.forEach((pin, index) => pinOrder.set(pin.id, index))
  board.pins.forEach((pin, index) => pinOrder.set(pin.id, board.powerPins.length + index))
  const pinUsage = Array.from(usageMap.values()).sort(
    (a, b) => (pinOrder.get(a.boardPinId) ?? 999) - (pinOrder.get(b.boardPinId) ?? 999),
  )

  const uniquePins = new Set(
    connectionsOf(prepared)
      .filter((connection) => connection.boardPinKind === 'gpio')
      .map((connection) => connection.boardPinId),
  )

  warnings.sort((a, b) => {
    const rank = { danger: 0, warning: 1, info: 2 }
    return rank[a.severity] - rank[b.severity]
  })

  return {
    boardId: board.id,
    connections: connectionsOf(prepared),
    warnings,
    guides,
    pinUsage,
    powerRails,
    unconnected,
    stats: {
      connections: connectionsOf(prepared).length,
      signals: connectionsOf(prepared).filter(
        (connection) => connection.role !== 'power' && connection.role !== 'ground',
      ).length,
      components: prepared.length,
      usedBoardPins: uniquePins.size,
    },
    status:
      unconnected.length > 0
        ? 'blocked'
        : warnings.some((warning) => warning.severity !== 'info')
          ? 'attention'
          : 'ready',
    generatedAt: new Date().toISOString(),
  }
}

const connectionsOf = (prepared: PreparedComponent[]): WiringConnection[] =>
  prepared.flatMap((component) => component.connections)

const defNeedsAdcWarning = (def: ComponentDefinition): boolean =>
  def.outputs5v || def.logicVoltage >= 5 || def.id === 'mq2' || def.id === 'hc-sr04'

export const connectionColor = (connection: WiringConnection): string =>
  connection.role === 'power'
    ? netColor[connection.net] ?? netColor['power-dc']
    : connection.role === 'ground'
      ? netColor.ground
      : netColor[connection.net] ?? netColor.gpio
