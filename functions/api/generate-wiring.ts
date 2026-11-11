import {
  aiConfigured,
  callAi,
  clampText,
  describeConnections,
  extractJson,
  fail,
  json,
  options,
  readJson,
  safeStringArray,
  type Env,
} from './_shared'

interface WiringRequestBody {
  prompt?: string
  board?: {
    id?: string
    name?: string
    chip?: string
    family?: string
    logicVoltage?: number
    powerPins?: string[]
  }
  components?: Array<{
    id?: string
    name?: string
    voltage?: { min?: number; max?: number; typical?: number }
    interfaces?: string[]
    pins?: string[]
    safety?: string[]
  }>
  wiring?: {
    status?: string
    connections?: Array<{
      boardPin?: string
      boardPinLabel?: string
      component?: string
      componentPin?: string
      role?: string
    }>
    warnings?: Array<{ severity?: string; title?: string; detail?: string }>
  }
}

interface WiringPayload {
  summary?: string
  risks?: unknown
  checks?: unknown
}

export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    let body: WiringRequestBody
    try {
      body = await readJson<WiringRequestBody>(context.request)
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Invalid request.', 400, context.env)
    }

    const board = body.board
    if (!board?.id || !board?.name) return fail('A board is required.', 400, context.env)

    const prompt = clampText(body.prompt, 2000)
    const components = (body.components ?? []).slice(0, 24)
    const connections = (body.wiring?.connections ?? []).slice(0, 120)
    const warnings = (body.wiring?.warnings ?? []).slice(0, 24)
    const logicVoltage = board.logicVoltage ?? 3.3

    const deterministicRisks = warnings.map(
      (warning) => `[${warning.severity ?? 'info'}] ${warning.title ?? 'Wiring warning'} — ${warning.detail ?? ''}`,
    )
    if (warnings.some((warning) => warning.severity === 'danger')) {
      deterministicRisks.unshift(
        'At least one danger-level warning is unresolved. Do not apply power until it is fixed.',
      )
    }
    if (connections.length === 0) {
      deterministicRisks.push('The wiring plan has no connections yet. Add components and regenerate the plan.')
    }

    const checks = [
      'Disconnect USB and every supply before changing jumper wires.',
      'Measure the 3.3 V / 5 V rail with a multimeter before attaching the first module.',
      'Confirm a common ground between the board and any external supply.',
      logicVoltage < 4
        ? 'Verify that no 5 V module output reaches a 3.3 V GPIO without a divider or level shifter.'
        : 'Verify that 3.3 V module inputs are 5 V tolerant before connecting them to a 5 V board.',
      'Check I2C addresses with a bus scanner when more than one device shares the bus.',
      'Keep motors, servos, relays and LTE transients on a supply with enough headroom.',
    ]

    let summary =
      `${components.length} module${components.length === 1 ? '' : 's'} mapped onto ${board.name} with ` +
      `${connections.length} pin connection${connections.length === 1 ? '' : 's'}. ` +
      `The deterministic engine reports status “${body.wiring?.status ?? 'unknown'}”.`
    let risks = deterministicRisks
    let source: 'cloud' | 'local' = 'local'
    let model: string | undefined
    let note: string | undefined

    if (aiConfigured(context.env)) {
      const componentLines = components
        .map(
          (component) =>
            `- ${component.name ?? component.id}: ${component.voltage?.typical ?? '?'} V typical [${(component.interfaces ?? []).join(', ') || 'custom'}] pins: ${(component.pins ?? []).slice(0, 12).join(', ')}`,
        )
        .join('\n')
      const warningLines = warnings
        .map((warning) => `- [${warning.severity ?? 'info'}] ${warning.title ?? 'warning'}: ${warning.detail ?? ''}`)
        .join('\n')

      const system = `You are MakerWire AI, an electronics safety reviewer. Review a pin-to-pin wiring plan before the user applies power.

Rules:
- Be concrete about voltage, current, logic levels, shared buses and grounds.
- Never invent connections that are not in the plan.
- Do not give mains-wiring instructions. Recommend an enclosure and a qualified electrician for mains.
- Return ONE JSON object with keys summary (string), risks (array of strings), checks (array of strings). No markdown.`

      const user = `BOARD
${clampText(board.name, 120)} (${clampText(board.chip, 80)}, ${board.family ?? 'unknown'} family)
Logic: ${logicVoltage} V
Power pins: ${(board.powerPins ?? []).join('; ') || 'not supplied'}

GOAL
${prompt || 'General circuit review'}

COMPONENTS
${componentLines || '(none)'}

WIRING PLAN
${describeConnections(connections) || '(no connections)'}

ENGINE WARNINGS
${warningLines || '(none)'}

Review the plan and return the JSON object.`

      try {
        const result = await callAi(
          context.env,
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { maxTokens: 1400, temperature: 0.2 },
        )
        const parsed = extractJson<WiringPayload>(result.text)
        const aiSummary = clampText(parsed?.summary, 2000)
        const aiRisks = safeStringArray(parsed?.risks, 12)
        const aiChecks = safeStringArray(parsed?.checks, 12)
        if (aiSummary || aiRisks.length) {
          summary = aiSummary || summary
          risks = [...aiRisks, ...deterministicRisks].slice(0, 16)
          source = 'cloud'
          model = result.model
          checks.length = 0
          checks.push(...(aiChecks.length ? aiChecks : [
            'Disconnect power before changing wiring.',
            'Measure every rail before connecting a module.',
          ]))
          note = 'AI review completed. The deterministic pin engine remains authoritative.'
        }
      } catch (error) {
        note =
          error instanceof Error
            ? `AI review unavailable: ${error.message}. Showing the deterministic safety review.`
            : 'AI review unavailable. Showing the deterministic safety review.'
      }
    } else {
      note = 'No AI provider configured. Showing the deterministic wiring and safety review.'
    }

    return json(
      {
        ok: true,
        source,
        summary,
        risks: risks.map((risk) => risk.trim()).filter(Boolean).slice(0, 16),
        checks: checks.map((check) => check.trim()).filter(Boolean).slice(0, 12),
        model,
        note,
      },
      200,
      context.env,
    )
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unexpected server error.', 500, context.env)
  }
}
