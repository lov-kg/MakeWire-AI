import type {
  Board,
  BoardCodeMeta,
  BoardDefaults,
  BoardPin,
  BoardPowerPin,
  LifecycleStatus,
  PinCapability,
} from '../types'

export const bp = (
  id: string,
  label: string,
  pinCode: string,
  caps: PinCapability[],
  gpio?: number | string,
  note?: string,
  restricted?: boolean,
  inputOnly?: boolean,
): BoardPin => ({ id, label, pinCode, caps: Array.from(new Set(caps)), gpio, note, restricted, inputOnly })

export const boardDefaults = (bus: {
  sda?: number
  scl?: number
  sck?: number
  mosi?: number
  miso?: number
  cs?: number
  tx?: number
  rx?: number
}): BoardDefaults => ({
  i2cSda: bus.sda === undefined ? undefined : `gpio${bus.sda}`,
  i2cScl: bus.scl === undefined ? undefined : `gpio${bus.scl}`,
  spiSck: bus.sck === undefined ? undefined : `gpio${bus.sck}`,
  spiMosi: bus.mosi === undefined ? undefined : `gpio${bus.mosi}`,
  spiMiso: bus.miso === undefined ? undefined : `gpio${bus.miso}`,
  spiCs: bus.cs === undefined ? undefined : `gpio${bus.cs}`,
  uartTx: bus.tx === undefined ? undefined : `gpio${bus.tx}`,
  uartRx: bus.rx === undefined ? undefined : `gpio${bus.rx}`,
})

export const pw = (
  id: string,
  label: string,
  voltage: number,
  maxCurrentMa: number,
  note?: string,
): BoardPowerPin => ({ id, label, voltage, maxCurrentMa, note })

export interface BoardSeed {
  id: string
  name: string
  shortName: string
  vendor: string
  chip: string
  family: string
  logicVoltage: number
  inputVoltage?: string
  flash?: string
  ram?: string
  clock?: string
  gpioCount?: number
  adcChannels?: number
  dacChannels?: number
  connectivity?: string[]
  interfaces?: string[]
  formFactor?: string
  description: string
  bestFor?: string[]
  tags?: string[]
  pins: BoardPin[]
  powerPins: BoardPowerPin[]
  defaults?: BoardDefaults
  notes?: string[]
  accent?: string
  code?: Partial<BoardCodeMeta>
  protocols?: string[]
  operatingTempC?: [number, number]
  ingressProtection?: string
  lifecycle?: LifecycleStatus
  datasheetUrl?: string
  standards?: string[]
  industrial?: boolean
  verified?: boolean
}

const defaultCode = (family: string, code?: Partial<BoardCodeMeta>): BoardCodeMeta => {
  const isEsp = family === 'Espressif'
  const isLinux = family === 'Raspberry Pi' || family === 'Linux SBC' || family === 'NVIDIA Jetson'
  const isPlc = family === 'Industrial PLC' || family === 'Industrial Controller'
  const platform: BoardCodeMeta['platform'] = isPlc
    ? 'structured-text'
    : isLinux
      ? 'python'
      : isEsp
        ? 'arduino'
        : 'arduino'
  return {
    platform,
    serialBaud: 115200,
    adcBits: isEsp ? 12 : 10,
    i2cSetup: isEsp ? 'begin' : 'begin',
    wifi: isEsp || isLinux,
    ...code,
  }
}

export const makeBoard = (seed: BoardSeed): Board => {
  const pins = seed.pins
  const powerPins = seed.powerPins
  return {
    id: seed.id,
    name: seed.name,
    shortName: seed.shortName,
    vendor: seed.vendor,
    chip: seed.chip,
    family: seed.family,
    logicVoltage: seed.logicVoltage,
    inputVoltage: seed.inputVoltage ?? `${seed.logicVoltage} V`,
    flash: seed.flash ?? 'n/a',
    ram: seed.ram ?? 'n/a',
    clock: seed.clock ?? 'n/a',
    gpioCount: seed.gpioCount ?? pins.filter((pin) => pin.caps.includes('gpio')).length,
    adcChannels: seed.adcChannels ?? pins.filter((pin) => pin.caps.includes('adc')).length,
    dacChannels: seed.dacChannels,
    connectivity: seed.connectivity ?? [],
    interfaces: seed.interfaces ?? ['GPIO'],
    formFactor: seed.formFactor ?? 'module',
    description: seed.description,
    bestFor: seed.bestFor ?? [],
    tags: seed.tags ?? [],
    pins,
    powerPins,
    defaults: seed.defaults ?? {},
    code: defaultCode(seed.family, seed.code),
    notes: seed.notes ?? [],
    accent: seed.accent ?? '#54e6b1',
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

const busCaps = (
  n: number,
  bus?: {
    sda?: number
    scl?: number
    sck?: number
    mosi?: number
    miso?: number
    cs?: number
    tx?: number
    rx?: number
    canTx?: number
    canRx?: number
    canH?: number
    canL?: number
    rs485a?: number
    rs485b?: number
  },
): PinCapability[] => {
  if (!bus) return []
  const caps: PinCapability[] = []
  if (bus.sda === n) caps.push('i2c-sda')
  if (bus.scl === n) caps.push('i2c-scl')
  if (bus.sck === n) caps.push('spi-sck')
  if (bus.mosi === n) caps.push('spi-mosi')
  if (bus.miso === n) caps.push('spi-miso')
  if (bus.cs === n) caps.push('spi-cs')
  if (bus.tx === n) caps.push('uart-tx')
  if (bus.rx === n) caps.push('uart-rx')
  if (bus.canTx === n) caps.push('can-tx')
  if (bus.canRx === n) caps.push('can-rx')
  if (bus.canH === n) caps.push('can-h')
  if (bus.canL === n) caps.push('can-l')
  if (bus.rs485a === n) caps.push('rs485-a')
  if (bus.rs485b === n) caps.push('rs485-b')
  return caps
}

export interface McuPinSeed {
  gpio: number[]
  adc?: number[]
  pwm?: number[] | 'all'
  dac?: number[]
  label?: (n: number) => string
  note?: Record<number, string>
  restricted?: number[]
  inputOnly?: number[]
  bus?: Parameters<typeof busCaps>[1]
}

export const mcuPins = (seed: McuPinSeed): BoardPin[] =>
  seed.gpio.map((n) => {
    const caps: PinCapability[] = ['gpio']
    if (!seed.inputOnly?.includes(n)) caps.push('pwm')
    if (seed.adc?.includes(n)) caps.push('adc')
    if (seed.dac?.includes(n)) caps.push('dac')
    caps.push(...busCaps(n, seed.bus))
    return bp(
      `gpio${n}`,
      (seed.label ?? ((value) => `GPIO ${value}`))(n),
      String(n),
      caps,
      n,
      seed.note?.[n],
      seed.restricted?.includes(n),
      seed.inputOnly?.includes(n),
    )
  })

export interface Esp32Seed extends Omit<BoardSeed, 'pins' | 'powerPins' | 'family' | 'logicVoltage'> {
  gpio: number[]
  adc?: number[]
  dac?: number[]
  psram?: string
  platform?: 'arduino' | 'esp-idf'
  bus?: Parameters<typeof busCaps>[1]
  usb?: string
  variant?: string
}

const esp32Defaults = {
  sda: 8,
  scl: 9,
  sck: 12,
  mosi: 11,
  miso: 13,
  cs: 10,
  tx: 43,
  rx: 44,
}

export const esp32Board = (seed: Esp32Seed): Board => {
  const bus = seed.bus ?? esp32Defaults
  const adc = seed.adc ?? seed.gpio.filter((n) => n <= 20 && n >= 1)
  const pins = mcuPins({
    gpio: seed.gpio,
    adc,
    dac: seed.dac,
    bus,
    note: seed.gpio.includes(0)
      ? { 0: 'Boot strapping pin; avoid for critical outputs.' }
      : undefined,
    restricted: [0, 3, 45, 46].filter((n) => seed.gpio.includes(n)),
  })
  return makeBoard({
    ...seed,
    family: 'Espressif',
    logicVoltage: 3.3,
    inputVoltage: seed.inputVoltage ?? '5 V USB / 5 V pin',
    flash: seed.flash ?? '8 MB',
    ram: seed.ram ?? '512 KB SRAM',
    clock: seed.clock ?? '240 MHz',
    adcChannels: adc.length,
    dacChannels: seed.dac?.length,
    connectivity: seed.connectivity ?? ['Wi-Fi', 'Bluetooth LE'],
    interfaces: seed.interfaces ?? ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
    formFactor: seed.formFactor ?? 'DevKit',
    pins,
    powerPins: [
      pw('vbus', '5V', 5, 1000, 'USB VBUS / 5 V input when powered externally'),
      pw('3v3', '3V3', 3.3, 600, 'On-board regulator output'),
      pw('gnd', 'GND', 0, 0),
    ],
    defaults: {
      i2cSda: `gpio${bus.sda}`,
      i2cScl: `gpio${bus.scl}`,
      spiSck: `gpio${bus.sck}`,
      spiMosi: `gpio${bus.mosi}`,
      spiMiso: `gpio${bus.miso}`,
      spiCs: `gpio${bus.cs}`,
      uartTx: `gpio${bus.tx}`,
      uartRx: `gpio${bus.rx}`,
    },
    code: { platform: seed.platform ?? 'arduino', wifi: true, adcBits: 12, ...seed.code },
    notes: [
      '3.3 V logic. GPIOs are not 5 V tolerant.',
      'Avoid strapping pins for relays, enable lines and other critical outputs.',
      ...(seed.notes ?? []),
    ],
    accent: seed.accent ?? '#54e6b1',
    tags: [
      'esp32',
      'wifi',
      'bluetooth',
      '3.3v',
      ...(seed.tags ?? []),
    ],
  })
}

export interface AvrSeed extends Omit<BoardSeed, 'pins' | 'powerPins' | 'family' | 'logicVoltage'> {
  digital: [number, number][]
  analog?: [number, number][]
  bus?: Parameters<typeof busCaps>[1]
  platform?: 'arduino'
}

export const avrBoard = (seed: AvrSeed): Board => {
  const bus = seed.bus ?? { sda: 18, scl: 19, sck: 13, mosi: 11, miso: 12, cs: 10, tx: 1, rx: 0 }
  const pinIdForGpio = (gpio?: number, fallback?: string): string | undefined => {
    const digital = seed.digital.find(([value]) => value === gpio)
    if (digital) return `d${digital[1]}`
    const analog = seed.analog?.find(([value]) => value === gpio)
    if (analog) return `a${analog[1]}`
    return fallback
  }
  const pins: BoardPin[] = []
  for (const [gpio, pinNumber] of seed.digital) {
    pins.push(
      bp(
        `d${pinNumber}`,
        `D${pinNumber}`,
        String(pinNumber),
        gpio === 0 || gpio === 1 ? ['gpio'] : ['gpio', 'pwm', ...busCaps(gpio, bus)],
        gpio,
        gpio === 0 || gpio === 1 ? 'Hardware serial; disconnect while uploading.' : undefined,
        gpio === 0 || gpio === 1,
      ),
    )
  }
  for (const [gpio, analogIndex] of seed.analog ?? []) {
    pins.push(
      bp(
        `a${analogIndex}`,
        `A${analogIndex}`,
        `A${analogIndex}`,
        ['gpio', 'adc', ...busCaps(gpio, bus)],
        gpio,
        'Analog input; 5 V reference on most AVR boards.',
      ),
    )
  }
  return makeBoard({
    ...seed,
    family: 'Arduino',
    logicVoltage: 5,
    inputVoltage: seed.inputVoltage ?? '5 V USB / 7-12 V Vin',
    flash: seed.flash ?? '32 KB',
    ram: seed.ram ?? '2 KB SRAM',
    clock: seed.clock ?? '16 MHz',
    adcChannels: seed.adcChannels ?? (seed.analog?.length ?? 6),
    connectivity: seed.connectivity ?? [],
    interfaces: seed.interfaces ?? ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
    formFactor: seed.formFactor ?? 'Arduino',
    pins,
    powerPins: [
      pw('vin', 'VIN', 5, 800, '7-12 V recommended on the barrel jack'),
      pw('5v', '5V', 5, 800, 'USB or on-board regulator output'),
      pw('3v3', '3.3V', 3.3, 50, 'Low-current regulator output'),
      pw('gnd', 'GND', 0, 0),
    ],
    defaults: {
      i2cSda: pinIdForGpio(bus.sda, 'd2'),
      i2cScl: pinIdForGpio(bus.scl, 'd3'),
      spiSck: pinIdForGpio(bus.sck, 'd13'),
      spiMosi: pinIdForGpio(bus.mosi, 'd11'),
      spiMiso: pinIdForGpio(bus.miso, 'd12'),
      spiCs: pinIdForGpio(bus.cs, 'd10'),
      uartTx: 'd1',
      uartRx: 'd0',
    },
    code: { platform: 'arduino', wifi: false, adcBits: 10, ...seed.code },
    notes: [
      '5 V logic. Most AVR inputs are 5 V only unless the board has level shifters.',
      'The 3.3 V pin is intended for low-current reference loads, not motors or radios.',
      ...(seed.notes ?? []),
    ],
    accent: seed.accent ?? '#22d3ee',
    tags: ['arduino', 'avr', '5v', ...(seed.tags ?? [])],
  })
}

export interface Stm32Seed extends Omit<BoardSeed, 'pins' | 'powerPins' | 'family' | 'logicVoltage'> {
  ports: string[]
  adc?: string[]
  dac?: string[]
  bus?: {
    sda?: string
    scl?: string
    sck?: string
    mosi?: string
    miso?: string
    cs?: string
    tx?: string
    rx?: string
    canTx?: string
    canRx?: string
  }
  debug?: string
}

export const stm32Board = (seed: Stm32Seed): Board => {
  const bus = seed.bus ?? {
    sda: 'PB7',
    scl: 'PB6',
    sck: 'PA5',
    mosi: 'PA7',
    miso: 'PA6',
    cs: 'PA4',
    tx: 'PA9',
    rx: 'PA10',
    canTx: 'PA12',
    canRx: 'PA11',
  }
  const pins = seed.ports.map((port) => {
    const key = port.toUpperCase()
    const caps: PinCapability[] = ['gpio', 'pwm']
    if (seed.adc?.includes(key)) caps.push('adc')
    if (seed.dac?.includes(key)) caps.push('dac')
    if (bus.sda === key) caps.push('i2c-sda')
    if (bus.scl === key) caps.push('i2c-scl')
    if (bus.sck === key) caps.push('spi-sck')
    if (bus.mosi === key) caps.push('spi-mosi')
    if (bus.miso === key) caps.push('spi-miso')
    if (bus.cs === key) caps.push('spi-cs')
    if (bus.tx === key) caps.push('uart-tx')
    if (bus.rx === key) caps.push('uart-rx')
    if (bus.canTx === key) caps.push('can-tx')
    if (bus.canRx === key) caps.push('can-rx')
    return bp(
      key.toLowerCase(),
      key,
      key,
      caps,
      key,
      key.startsWith('PC13') ? 'On-board LED on many Blue Pill boards; low drive strength.' : undefined,
      key === 'PC13',
    )
  })
  return makeBoard({
    ...seed,
    family: 'STM32',
    logicVoltage: 3.3,
    inputVoltage: seed.inputVoltage ?? '5 V USB / 5 V pin',
    flash: seed.flash ?? '64 KB',
    ram: seed.ram ?? '20 KB SRAM',
    clock: seed.clock ?? '72 MHz',
    adcChannels: seed.adc?.length ?? 10,
    dacChannels: seed.dac?.length,
    connectivity: seed.connectivity ?? [],
    interfaces: seed.interfaces ?? ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART', 'CAN'],
    formFactor: seed.formFactor ?? 'Blue Pill',
    pins,
    powerPins: [
      pw('5v', '5V', 5, 500, 'USB VBUS / 5 V input'),
      pw('3v3', '3.3V', 3.3, 300, 'On-board LDO output'),
      pw('gnd', 'GND', 0, 0),
    ],
    defaults: {
      i2cSda: bus.sda?.toLowerCase(),
      i2cScl: bus.scl?.toLowerCase(),
      spiSck: bus.sck?.toLowerCase(),
      spiMosi: bus.mosi?.toLowerCase(),
      spiMiso: bus.miso?.toLowerCase(),
      spiCs: bus.cs?.toLowerCase(),
      uartTx: bus.tx?.toLowerCase(),
      uartRx: bus.rx?.toLowerCase(),
    },
    code: { platform: 'arduino', wifi: false, adcBits: 12, ...seed.code },
    notes: [
      '3.3 V logic. 5 V tolerant on many FT pins, but check the exact package and pin.',
      'Use ST-Link or DFU to flash; the Arduino core is STM32duino.',
      ...(seed.notes ?? []),
    ],
    accent: seed.accent ?? '#818cf8',
    tags: ['stm32', 'arm', '3.3v', 'can', ...(seed.tags ?? [])],
    protocols: seed.protocols ?? ['CAN'],
  })
}

export interface PicoSeed extends Omit<BoardSeed, 'pins' | 'powerPins' | 'family' | 'logicVoltage' | 'chip' | 'flash' | 'ram'> {
  gpio?: number[]
  adc?: number[]
  wireless?: boolean
  chip?: string
  flash?: string
  ram?: string
}

export const picoBoard = (seed: PicoSeed): Board => {
  const gpio = seed.gpio ?? Array.from({ length: 29 }, (_, i) => i)
  const bus = { sda: 4, scl: 5, sck: 18, mosi: 19, miso: 16, cs: 17, tx: 0, rx: 1 }
  const pins = mcuPins({
    gpio,
    adc: seed.adc ?? [26, 27, 28].filter((n) => gpio.includes(n)),
    bus,
    note: { 23: 'Internal SMPS mode control on Pico W.', 24: 'VBUS sense.', 29: 'ADC3 / VSYS monitor on some boards.' },
    restricted: [23, 24, 29].filter((n) => gpio.includes(n)),
  })
  return makeBoard({
    ...seed,
    family: 'RP2040',
    chip: seed.chip ?? 'RP2040',
    logicVoltage: 3.3,
    inputVoltage: seed.inputVoltage ?? '5 V USB / 1.8-5.5 V VSYS',
    flash: seed.flash ?? '2 MB',
    ram: seed.ram ?? '264 KB SRAM',
    clock: seed.clock ?? '133 MHz',
    adcChannels: seed.adc?.length ?? 3,
    connectivity: seed.wireless ? ['Wi-Fi', 'Bluetooth 5.2'] : [],
    interfaces: seed.interfaces ?? ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART', 'PIO'],
    formFactor: seed.formFactor ?? 'Pico',
    pins,
    powerPins: [
      pw('vbus', 'VBUS', 5, 500, 'USB VBUS'),
      pw('vsys', 'VSYS', 5, 800, '1.8-5.5 V input; not a 5 V regulator output'),
      pw('3v3', '3V3', 3.3, 300, 'On-board SMPS output'),
      pw('gnd', 'GND', 0, 0),
    ],
    defaults: {
      i2cSda: 'gpio4',
      i2cScl: 'gpio5',
      spiSck: 'gpio18',
      spiMosi: 'gpio19',
      spiMiso: 'gpio16',
      spiCs: 'gpio17',
      uartTx: 'gpio0',
      uartRx: 'gpio1',
    },
    code: { platform: 'arduino', wifi: Boolean(seed.wireless), adcBits: 12, ...seed.code },
    notes: [
      '3.3 V logic. RP2040 GPIOs are not 5 V tolerant.',
      'PIO makes extra UART/SPI/I2S channels possible when the hardware peripherals are busy.',
      ...(seed.notes ?? []),
    ],
    accent: seed.accent ?? '#f472b6',
    tags: ['rp2040', 'pico', '3.3v', 'pio', ...(seed.tags ?? [])],
  })
}

/** Raspberry Pi / Jetson 40-pin header. Only the user-accessible GPIOs are listed. */
export const rpiHeaderPins = (): BoardPin[] => {
  const map: Array<[number, number, PinCapability[], string?]> = [
    [2, 3, ['gpio', 'i2c-sda'], 'I2C1 SDA (1.8 kΩ pull-up)'],
    [3, 5, ['gpio', 'i2c-scl'], 'I2C1 SCL (1.8 kΩ pull-up)'],
    [4, 7, ['gpio']],
    [17, 11, ['gpio']],
    [27, 13, ['gpio']],
    [22, 15, ['gpio']],
    [10, 19, ['gpio', 'spi-mosi']],
    [9, 21, ['gpio', 'spi-miso']],
    [11, 23, ['gpio', 'spi-sck']],
    [8, 24, ['gpio', 'spi-cs']],
    [25, 22, ['gpio']],
    [24, 18, ['gpio', 'pwm']],
    [23, 16, ['gpio', 'pwm']],
    [18, 12, ['gpio', 'pwm']],
    [15, 10, ['gpio']],
    [14, 8, ['gpio', 'uart-tx'], 'UART TXD (3.3 V)'],
    [12, 32, ['gpio', 'pwm']],
    [16, 36, ['gpio']],
    [20, 38, ['gpio']],
    [21, 40, ['gpio']],
  ]
  return map.map(([gpio, physical, caps, note]) =>
    bp(`gpio${gpio}`, `GPIO ${gpio}`, `Pin ${physical}`, caps, gpio, note),
  )
}

export const linuxDefaults: BoardDefaults = {
  i2cSda: 'gpio2',
  i2cScl: 'gpio3',
  spiSck: 'gpio11',
  spiMosi: 'gpio10',
  spiMiso: 'gpio9',
  spiCs: 'gpio8',
  uartTx: 'gpio14',
  uartRx: 'gpio15',
}

export interface LinuxBoardSeed extends Omit<BoardSeed, 'pins' | 'powerPins' | 'family' | 'logicVoltage'> {
  family?: string
  logicVoltage?: number
  gpio?: number
  wifi?: boolean
}

export const linuxBoard = (seed: LinuxBoardSeed): Board => {
  const pins = rpiHeaderPins()
  return makeBoard({
    ...seed,
    family: seed.family ?? 'Raspberry Pi',
    logicVoltage: 3.3,
    inputVoltage: seed.inputVoltage ?? '5 V USB-C / PoE HAT',
    flash: seed.flash ?? 'microSD / eMMC',
    ram: seed.ram ?? '2-8 GB LPDDR4',
    clock: seed.clock ?? '1.5-2.4 GHz',
    gpioCount: seed.gpio ?? 17,
    adcChannels: 0,
    connectivity: seed.connectivity ?? ['Wi-Fi', 'Bluetooth', 'Ethernet'],
    interfaces: seed.interfaces ?? ['40-pin header', 'GPIO', 'I2C', 'SPI', 'UART', 'USB', 'Ethernet'],
    formFactor: seed.formFactor ?? 'SBC',
    pins,
    powerPins: [
      pw('5v', '5V', 5, 1500, '5 V rail from the USB-C / PoE supply'),
      pw('3v3', '3.3V', 3.3, 500, 'On-board regulator; shared with the SoC'),
      pw('gnd', 'GND', 0, 0),
    ],
    defaults: linuxDefaults,
    code: {
      platform: 'python',
      serialBaud: 115200,
      adcBits: 12,
      i2cSetup: 'begin',
      wifi: seed.wifi ?? true,
      ...seed.code,
    },
    notes: [
      '3.3 V GPIOs, no analog inputs, and no 5 V tolerance. Use an external ADC for analog sensors.',
      'GPIO current is small (a few mA per pin). Drive relays and motors through a driver or HAT.',
      'Use gpiozero / libgpiod / smbus2; do not bit-bang hard-real-time protocols on Linux.',
      ...(seed.notes ?? []),
    ],
    accent: seed.accent ?? '#f43f5e',
    tags: ['linux', 'python', '3.3v', ...(seed.tags ?? [])],
  })
}

export interface PlcSeed extends Omit<BoardSeed, 'pins' | 'powerPins' | 'family' | 'logicVoltage' | 'code'> {
  di?: number
  ai?: number
  doRelay?: number
  doTransistor?: number
  ao?: number
  supply?: number
  family?: string
  protocols?: string[]
}

export const plcBoard = (seed: PlcSeed): Board => {
  const pins: BoardPin[] = []
  for (let i = 1; i <= (seed.di ?? 8); i += 1) {
    pins.push(bp(`di${i}`, `DI${i}`, `I${i}`, ['gpio'], `DI${i}`, '24 V digital input; isolated.'))
  }
  for (let i = 1; i <= (seed.ai ?? 4); i += 1) {
    pins.push(bp(`ai${i}`, `AI${i}`, `AI${i}`, ['adc'], `AI${i}`, '0-10 V or 4-20 mA analog input (configure in software).'))
  }
  for (let i = 1; i <= (seed.doRelay ?? 4); i += 1) {
    pins.push(bp(`do${i}`, `DO${i}`, `Q${i}`, ['gpio'], `DO${i}`, 'Relay output; check contact rating.'))
  }
  for (let i = 1; i <= (seed.doTransistor ?? 4); i += 1) {
    pins.push(bp(`dq${i}`, `DQ${i}`, `Q${i}`, ['gpio', 'pwm'], `DQ${i}`, '24 V transistor output; inductive loads need a flyback diode.'))
  }
  for (let i = 1; i <= (seed.ao ?? 2); i += 1) {
    pins.push(bp(`ao${i}`, `AO${i}`, `AQ${i}`, ['dac'], `AO${i}`, '0-10 V / 4-20 mA analog output.'))
  }
  const supply = seed.supply ?? 24
  return makeBoard({
    ...seed,
    family: seed.family ?? 'Industrial PLC',
    logicVoltage: supply,
    inputVoltage: seed.inputVoltage ?? `${supply} V DC nominal (18-30 V)`,
    flash: seed.flash ?? 'program + retentive memory',
    ram: seed.ram ?? 'PLC work memory',
    clock: seed.clock ?? 'PLC scan cycle',
    gpioCount: (seed.di ?? 8) + (seed.ai ?? 4) + (seed.doRelay ?? 4) + (seed.doTransistor ?? 4) + (seed.ao ?? 2),
    adcChannels: seed.ai ?? 4,
    dacChannels: seed.ao,
    connectivity: seed.connectivity ?? ['Ethernet'],
    interfaces: seed.interfaces ?? ['24 V DI', 'Relay DO', '24 V transistor DO', 'Analog IO', 'Fieldbus'],
    formFactor: seed.formFactor ?? 'DIN rail',
    pins,
    powerPins: [
      pw('lplus', 'L+ / 24V', supply, 2000, 'Controller supply; do not use it as a motor supply'),
      pw('m', 'M / 0V', 0, 0, 'Common 0 V reference'),
      pw('pe', 'PE', 0, 0, 'Protective earth'),
    ],
    defaults: {},
    code: {
      platform: 'structured-text',
      serialBaud: 115200,
      adcBits: 12,
      i2cSetup: 'begin',
      wifi: false,
    },
    notes: [
      'This is an IEC 61131-3 target, not an Arduino board. Verify the exact CPU, I/O map and safety rating.',
      '24 V inductive loads need flyback suppression; relay contacts have a finite electrical life.',
      'Safety functions require a certified safety controller and risk assessment — not this tool.',
      ...(seed.notes ?? []),
    ],
    accent: seed.accent ?? '#f59e0b',
    tags: ['plc', 'industrial', '24v', 'din-rail', ...(seed.tags ?? [])],
    protocols: seed.protocols,
    industrial: true,
  })
}
