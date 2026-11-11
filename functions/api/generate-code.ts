import {
  callAi,
  clampNumber,
  clampText,
  describeConnections,
  extractJson,
  fail,
  json,
  options,
  readJson,
  safeStringArray,
  sanitizeFilename,
  type Env,
} from './_shared'

interface CodeRequestBody {
  prompt?: string
  framework?: string
  board?: {
    id?: string
    name?: string
    chip?: string
    family?: string
    logicVoltage?: number
    adcBits?: number
    wifi?: boolean
  }
  components?: Array<{
    id?: string
    name?: string
    interfaces?: string[]
    i2cAddress?: string
    pins?: string[]
  }>
  wiring?: {
    status?: string
    signals?: number
    connections?: Array<{
      boardPin?: string
      boardPinLabel?: string
      component?: string
      componentPin?: string
      role?: string
      note?: string
    }>
    warnings?: Array<{ severity?: string; title?: string; detail?: string }>
  }
  localCode?: string
}

interface CodePayload {
  title?: string
  code?: string
  filename?: string
  explanation?: string
  libraries?: unknown
}

const frameworkRules: Record<string, string> = {
  arduino: [
    'Target: Arduino C++ (Arduino IDE / arduino-cli). Use setup() and loop().',
    'Use only libraries that exist for the selected board. Add clear #include lines.',
    'Define every board pin as a named macro or const. Keep all generated pin numbers exactly as supplied.',
  ].join(' '),
  micropython: [
    'Target: MicroPython. Produce a single main.py that runs standalone.',
    'Use machine.Pin/PWM/I2C/UART/ADC and standard modules. Note any driver file the user must copy to the board.',
    'Keep all generated pin numbers exactly as supplied.',
  ].join(' '),
  'esp-idf': [
    'Target: ESP-IDF v5.x native C++ (main.cpp). Use ESP_LOGI, FreeRTOS and driver APIs.',
    'Initialise the exact GPIOs from the wiring map. Do not emit Arduino APIs for an ESP-IDF target.',
    'Document managed components in the explanation and keep optional sensor drivers as honest TODOs.',
  ].join(' '),
  python: [
    'Target: Python 3 on a Linux SBC (Raspberry Pi / Jetson / industrial Linux). Produce a single runnable .py file.',
    'Use board-appropriate libraries (gpiozero, gpiod, smbus2, spidev, pyserial) and state what must be installed.',
    'Header pin codes are physical references: never assume BCM numbering. Keep the exact supplied pin map in a WIRING dictionary.',
  ].join(' '),
  'structured-text': [
    'Target: IEC 61131-3 Structured Text for a PLC. Produce one PROGRAM with VAR / END_VAR and a cyclic body.',
    'Do not invent %I/%Q addresses. Keep symbolic names and document the field I/O mapping in comments.',
    'Never claim a standard task is safety-rated; safety functions belong in hardware or a safety controller.',
  ].join(' '),
}

const fallbackFilenames: Record<string, string> = {
  arduino: 'makerwire_sketch.ino',
  micropython: 'main.py',
  'esp-idf': 'main.cpp',
  python: 'main.py',
  'structured-text': 'makerwire.st',
}

export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    let body: CodeRequestBody
    try {
      body = await readJson<CodeRequestBody>(context.request)
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Invalid request.', 400, context.env)
    }

    const prompt = clampText(body.prompt, 4000).trim()
    const board = body.board
    if (!prompt) return fail('Describe what the circuit should do.', 400, context.env)
    if (!board?.id || !board?.name) return fail('A board is required.', 400, context.env)
    if (!clampText(body.localCode, 1).trim()) {
      return fail('The local pin-aware sketch is required so the AI preserves the wiring plan.', 400, context.env)
    }

    const framework = ['arduino', 'micropython', 'esp-idf', 'python', 'structured-text'].includes(body.framework || '')
      ? (body.framework as string)
      : 'arduino'
    const logicVoltage = clampNumber(board.logicVoltage, 1.8, 48, 3.3)
    const adcBits = clampNumber(board.adcBits, 8, 24, 12)
    const components = (body.components ?? []).slice(0, 24)
    const connections = (body.wiring?.connections ?? []).slice(0, 120)
    const warnings = (body.wiring?.warnings ?? []).slice(0, 20)
    const localCode = clampText(body.localCode, 18_000)

    const componentLines = components
      .map(
        (component) =>
          `- ${component.name ?? component.id} [${(component.interfaces ?? []).join(', ') || 'custom'}]${
            component.i2cAddress ? ` address ${component.i2cAddress}` : ''
          }${component.pins?.length ? ` pins: ${component.pins.slice(0, 12).join(', ')}` : ''}`,
      )
      .join('\n')

    const warningLines = warnings
      .map((warning) => `- [${warning.severity ?? 'info'}] ${warning.title ?? 'Warning'}: ${warning.detail ?? ''}`)
      .join('\n')

    const system = `You are MakerWire AI, a senior embedded systems engineer. You write complete, conservative firmware for real hardware.

${frameworkRules[framework]}

HARD RULES
1. The wiring map below is authoritative. Never change a pin number, invent a new connection, or silently swap a pin.
2. If a module cannot be driven safely with the supplied wiring, explain the limitation and emit a safe serial/status fallback instead of pretending it works.
3. Never put real Wi-Fi credentials, API keys or personal data in the sketch. Use YOUR_WIFI_SSID / YOUR_WIFI_PASSWORD placeholders.
4. Keep the code complete enough to compile. No pseudo-code, no "..." elisions, no markdown fences.
5. Respect the board logic voltage. Call out level shifting or external supplies where needed.
6. Return ONE JSON object with exactly these keys: title (string), code (string), filename (string), explanation (string), libraries (array of strings). Nothing outside the JSON object.`

    const user = `BOARD
Name: ${clampText(board.name, 120)}
Chip: ${clampText(board.chip, 80)}
Family: ${clampText(board.family, 40)}
Logic: ${logicVoltage} V
ADC: ${adcBits} bit
Wi-Fi: ${board.wifi ? 'yes' : 'no'}
Framework: ${framework}

PROJECT GOAL
${prompt}

SELECTED COMPONENTS
${componentLines || '(none)'}

AUTHORITATIVE WIRING MAP
${describeConnections(connections) || '(no connections)'}

SAFETY WARNINGS FROM THE PIN ENGINE
${warningLines || '(none)'}

DETERMINISTIC LOCAL SKETCH (baseline; improve it without changing pins)
${localCode}

Return the JSON object now.`

    let result
    try {
      result = await callAi(
        context.env,
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 4600, temperature: 0.15 },
      )
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : 'The AI provider is unavailable. The local sketch is still available.',
        503,
        context.env,
      )
    }

    const parsed = extractJson<CodePayload>(result.text)
    const code = clampText(parsed?.code, 80_000).trim()
    if (!code) {
      return fail('The AI response did not contain a usable sketch. The local sketch is still available.', 502, context.env)
    }

    const requestedName = sanitizeFilename(parsed?.filename, fallbackFilenames[framework])
    const expectedExtension =
      framework === 'micropython' || framework === 'python'
        ? '.py'
        : framework === 'structured-text'
          ? '.st'
          : framework === 'esp-idf'
            ? '.cpp'
            : '.ino'
    const filename = requestedName.includes('.')
      ? requestedName
      : `${requestedName}${expectedExtension}`

    return json(
      {
        ok: true,
        source: 'cloud',
        title: clampText(parsed?.title, 120) || 'AI-enhanced firmware',
        code,
        filename,
        explanation:
          clampText(parsed?.explanation, 6000) ||
          `Enhanced by ${result.model}. The pin map matches the MakerWire wiring plan.`,
        libraries: safeStringArray(parsed?.libraries, 20),
        framework,
        model: result.model,
        note: 'Cloud-enhanced sketch. Review it before flashing; the deterministic local sketch remains in your history.',
      },
      200,
      context.env,
    )
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : 'Unexpected server error.',
      500,
      context.env,
    )
  }
}
