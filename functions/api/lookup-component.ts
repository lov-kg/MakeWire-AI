import {
  aiConfigured,
  callAi,
  clampNumber,
  clampText,
  extractJson,
  fail,
  json,
  options,
  readJson,
  safeStringArray,
  type Env,
} from './_shared'

interface LookupBody {
  query?: string
}

interface RawPin {
  label?: string
  role?: string
  direction?: string
  required?: boolean
  note?: string
}

interface RawComponent {
  found?: boolean
  reason?: string
  name?: string
  shortName?: string
  category?: string
  description?: string
  manufacturer?: string
  voltage?: { min?: number; max?: number; typical?: number }
  logicVoltage?: number
  fiveVoltTolerant?: boolean
  outputs5v?: boolean
  current?: { typicalMa?: number; peakMa?: number }
  interfaces?: unknown
  pins?: RawPin[]
  i2cAddress?: string
  requiresExternalSupply?: boolean
  safety?: unknown
  tags?: unknown
}

const ROLES = new Set([
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
])

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'component'

const normalize = (raw: RawComponent) => {
  const name = clampText(raw.name, 120).trim()
  if (!name) return null
  const voltageTypical = clampNumber(raw.voltage?.typical ?? raw.logicVoltage, 1.8, 48, 3.3)
  const logicVoltage = clampNumber(raw.logicVoltage, 1.8, 5.5, Math.min(5, voltageTypical))
  const rawPins = Array.isArray(raw.pins) ? raw.pins.slice(0, 24) : []

  const pins = rawPins
    .map((pin, index) => {
      const label = clampText(pin.label, 40).trim() || `Pin ${index + 1}`
      const role = ROLES.has(String(pin.role)) ? String(pin.role) : 'digital'
      const direction =
        pin.direction === 'in' || pin.direction === 'out' || pin.direction === 'bidir'
          ? pin.direction
          : undefined
      return {
        id: `pin${index + 1}`,
        label,
        role,
        direction,
        required: pin.required !== false,
        note: clampText(pin.note, 240) || undefined,
      }
    })
    .filter((pin) => pin.role !== 'nc' || pin.required === false)

  if (!pins.some((pin) => pin.role === 'power')) {
    pins.unshift({ id: 'vcc', label: 'VCC', role: 'power', direction: undefined, required: true, note: undefined })
  }
  if (!pins.some((pin) => pin.role === 'ground')) {
    pins.unshift({ id: 'gnd', label: 'GND', role: 'ground', direction: undefined, required: true, note: undefined })
  }

  const shortName = (clampText(raw.shortName, 40).trim() || name).slice(0, 34)
  const interfaces = safeStringArray(raw.interfaces, 8)
  const safety = safeStringArray(raw.safety, 10)
  if (!safety.length) {
    safety.push('AI-generated component data. Verify pinout, voltage and current against the manufacturer datasheet before powering the module.')
  }

  return {
    id: `ai-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    shortName,
    category: clampText(raw.category, 40).trim() || 'Other',
    description:
      clampText(raw.description, 1200).trim() ||
      'Component looked up by MakerWire AI. Pin roles are a best-effort mapping — confirm against the datasheet.',
    manufacturer: clampText(raw.manufacturer, 80).trim() || undefined,
    voltage: {
      min: clampNumber(raw.voltage?.min, 1.8, 48, Math.max(1.8, voltageTypical - 0.3)),
      max: clampNumber(raw.voltage?.max, 1.8, 48, Math.max(voltageTypical, voltageTypical + 0.3)),
      typical: voltageTypical,
    },
    logicVoltage,
    fiveVoltTolerant: Boolean(raw.fiveVoltTolerant),
    outputs5v: Boolean(raw.outputs5v),
    current: {
      typicalMa: clampNumber(raw.current?.typicalMa, 0, 20_000, 20),
      peakMa: clampNumber(raw.current?.peakMa, 0, 20_000, Math.max(20, clampNumber(raw.current?.typicalMa, 0, 20_000, 20))),
    },
    interfaces: interfaces.length ? interfaces : ['Custom'],
    pins,
    i2cAddress: clampText(raw.i2cAddress, 40).trim() || undefined,
    requiresExternalSupply: Boolean(raw.requiresExternalSupply),
    safety,
    tags: safeStringArray(raw.tags, 12),
    aiGenerated: true,
  }
}

export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    let body: LookupBody
    try {
      body = await readJson<LookupBody>(context.request)
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Invalid request.', 400, context.env)
    }

    const query = clampText(body.query, 300).trim()
    if (query.length < 2) return fail('Enter a module or sensor name to look up.', 400, context.env)

    if (!aiConfigured(context.env)) {
      return fail(
        'AI component lookup is not configured on this deployment. Use the manual custom component form instead.',
        503,
        context.env,
      )
    }

    const system = `You are MakerWire AI's component librarian. Identify a real, commercially available maker module from the user's query.

Return ONE JSON object with this exact shape:
{
  "found": true,
  "name": "full product name",
  "shortName": "short label",
  "category": "Sensors | Displays | Actuators | Communications | Storage | Power | User Input | Other",
  "description": "2-3 sentences",
  "manufacturer": "brand or Unknown",
  "voltage": { "min": 3.3, "max": 5, "typical": 3.3 },
  "logicVoltage": 3.3,
  "fiveVoltTolerant": false,
  "outputs5v": false,
  "current": { "typicalMa": 20, "peakMa": 40 },
  "interfaces": ["I2C"],
  "pins": [
    { "label": "VCC", "role": "power", "required": true },
    { "label": "GND", "role": "ground", "required": true },
    { "label": "SDA", "role": "i2c-sda", "direction": "bidir", "required": true }
  ],
  "i2cAddress": "0x3C or null",
  "requiresExternalSupply": false,
  "safety": ["concrete safety note"],
  "tags": ["search", "keywords"]
}

Allowed pin roles: power, ground, i2c-sda, i2c-scl, spi-sck, spi-mosi, spi-miso, spi-cs, uart-tx, uart-rx, analog, digital, pwm, onewire, nc.
Rules:
- Only describe a real module. If you do not know it, return { "found": false, "reason": "..." }.
- Always include every power/ground pin and every signal pin needed for normal operation.
- Never mark a 3.3 V-only module as 5 V tolerant.
- Flag modules that drive 5 V outputs or need an external supply.
- Be conservative with current ratings.`

    let result
    try {
      result = await callAi(
        context.env,
        [
          { role: 'system', content: system },
          { role: 'user', content: `Module query: ${query}` },
        ],
        { maxTokens: 1500, temperature: 0.1 },
      )
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : 'Component lookup is unavailable.',
        503,
        context.env,
      )
    }

    const parsed = extractJson<RawComponent>(result.text)
    if (!parsed) {
      return fail('The AI response could not be parsed. Try a more specific module name.', 502, context.env)
    }
    if (parsed.found === false) {
      return json(
        {
          ok: true,
          component: null,
          candidates: [],
          note: clampText(parsed.reason, 500) || 'No reliable match was found. Try the exact breakout name or add it manually.',
        },
        200,
        context.env,
      )
    }

    const component = normalize(parsed)
    if (!component) {
      return fail('The AI response was missing a component name.', 502, context.env)
    }

    return json(
      {
        ok: true,
        component,
        candidates: [component],
        note: `Generated by ${result.model}. Verify the pinout and ratings against the datasheet before use.`,
      },
      200,
      context.env,
    )
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unexpected server error.', 500, context.env)
  }
}
