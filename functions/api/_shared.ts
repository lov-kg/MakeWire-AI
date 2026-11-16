/**
 * Shared helpers for MakerWire AI API functions.
 *
 * These modules are written as Pages Functions and compiled into the Cloudflare
 * Worker with `wrangler pages functions build` (see package.json).
 *
 * Bindings (set in the Cloudflare dashboard or wrangler.toml):
 *   AI                 Workers AI binding
 *   GEMINI_API_KEY     optional secret; server-side Gemini key (never sent to the browser)
 *   GEMINI_MODEL       optional, defaults to gemini-2.5-flash
 *   OPENAI_API_KEY     optional secret; when present OpenAI is used before Workers AI
 *   OPENAI_MODEL       optional, defaults to gpt-4o-mini
 *   WORKERS_AI_MODEL   optional, defaults to a Llama 3.3 instruct model
 *
 * Per-request override:
 *   X-Gemini-Api-Key header — a user-provided Gemini API key from Settings
 *   (stored in localStorage). When present it takes priority over the
 *   server-side key and providers for that request only. It is never logged
 *   or echoed back in a response.
 */

export interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

export interface Env {
  AI?: AiBinding
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  WORKERS_AI_MODEL?: string
  ALLOWED_ORIGIN?: string
  /** Static asset binding configured under `[assets]` in wrangler.toml. */
  ASSETS?: { fetch: (input: string | URL | Request) => Promise<Response> }
}

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const GEMINI_API_KEY_HEADER = 'x-gemini-api-key'

export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

const baseHeaders = (env?: Env): Record<string, string> => ({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': env?.ALLOWED_ORIGIN || '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type, x-gemini-api-key, authorization',
})

export const json = (data: unknown, status = 200, env?: Env): Response =>
  new Response(JSON.stringify(data), { status, headers: baseHeaders(env) })

export const fail = (message: string, status = 400, env?: Env): Response =>
  json({ ok: false, error: message }, status, env)

export const options = (env?: Env): Response =>
  new Response(null, { status: 204, headers: baseHeaders(env) })

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Expected an application/json request body.')
  }
  try {
    return (await request.json()) as T
  } catch {
    throw new Error('The request body is not valid JSON.')
  }
}

export const clampText = (value: unknown, limit: number): string => {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').slice(0, limit)
}

export const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiResult {
  text: string
  model: string
}

export type GeminiKeySource = 'user' | 'server' | 'none'

export interface GeminiKeyResolution {
  key?: string
  source: GeminiKeySource
  model: string
}

export const geminiModel = (env: Env): string =>
  (env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, '')

/** Resolve the Gemini key without ever exposing it to the caller's response. */
export const resolveGeminiKey = (context: { env: Env; request: Request }): GeminiKeyResolution => {
  const header = (context.request.headers.get(GEMINI_API_KEY_HEADER) || '').trim()
  const server = (context.env.GEMINI_API_KEY || '').trim()
  const model = geminiModel(context.env)
  if (header) return { key: header, source: 'user', model }
  if (server) return { key: server, source: 'server', model }
  return { source: 'none', model }
}

export const aiConfigured = (env: Env, geminiApiKey?: string): boolean =>
  Boolean(geminiApiKey || env.GEMINI_API_KEY || env.OPENAI_API_KEY || env.AI)

/** Remove a credential from any diagnostic text before it reaches a response. */
export const redactSecret = (value: string, secret?: string): string => {
  if (!secret) return value
  return value.split(secret).join('[redacted]')
}

const describeGeminiFailure = (
  status: number,
  detail: string,
): { state: 'invalid-key' | 'rate-limited' | 'error'; message: string } => {
  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|API key not valid|invalid[^.]{0,20}api[^.]{0,20}key|invalid authentication/i.test(detail)
  ) {
    return {
      state: 'invalid-key',
      message:
        'Google rejected the API key. Create or copy a valid key in Google AI Studio and confirm the Generative Language API is enabled for that project.',
    }
  }
  if (status === 429) {
    return {
      state: 'rate-limited',
      message: 'The key is valid but Gemini is rate limiting requests. Wait a moment and test again.',
    }
  }
  if (status === 404) {
    return {
      state: 'error',
      message:
        'The configured Gemini model is not available for this key. Set GEMINI_MODEL to a model your project can access.',
    }
  }
  return {
    state: 'error',
    message: `Gemini returned HTTP ${status}. ${detail.slice(0, 220)}`.trim(),
  }
}

export type GeminiProbeState = 'connected' | 'invalid-key' | 'rate-limited' | 'error'

export interface GeminiProbeResult {
  state: GeminiProbeState
  message: string
  model: string
  latencyMs: number
}

/**
 * Validate a Gemini key with the smallest useful request possible. The key is
 * only ever sent to Google; the result describes connectivity and never
 * contains the credential.
 */
export async function probeGemini(apiKey: string, model: string): Promise<GeminiProbeResult> {
  const started = Date.now()
  const safeModel = model.replace(/^models\//, '')
  try {
    const response = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(safeModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        }),
      },
    )
    const latencyMs = Date.now() - started
    const raw = await response.text().catch(() => '')
    if (!response.ok) {
      const detail = redactSecret(raw, apiKey)
      const failure = describeGeminiFailure(response.status, detail)
      return { ...failure, model: safeModel, latencyMs }
    }
    return {
      state: 'connected',
      message: `Connected to gemini/${safeModel} in ${latencyMs} ms.`,
      model: safeModel,
      latencyMs,
    }
  } catch {
    return {
      state: 'error',
      message:
        'Could not reach the Gemini API. Check the deployment network access and try again — the key may still be valid.',
      model: safeModel,
      latencyMs: Date.now() - started,
    }
  }
}

const callGemini = async (
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<AiResult> => {
  const system = messages.find((message) => message.role === 'system')?.content
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))

  const response = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    },
  )
  if (!response.ok) {
    const detail = redactSecret(await response.text().catch(() => ''), apiKey)
    const failure = describeGeminiFailure(response.status, detail)
    throw new Error(`Gemini: ${failure.message}`)
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned an empty response.')
  return { text, model: `gemini/${model}` }
}

export async function callAi(
  env: Env,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number } = {},
  geminiApiKey?: string,
): Promise<AiResult> {
  const maxTokens = options.maxTokens ?? 4096
  const temperature = options.temperature ?? 0.2
  const model = geminiModel(env)
  const userKey = (geminiApiKey || '').trim()
  const serverKey = (env.GEMINI_API_KEY || '').trim()
  if (userKey) {
    return callGemini(userKey, model, messages, maxTokens, temperature)
  }
  if (serverKey) {
    return callGemini(serverKey, model, messages, maxTokens, temperature)
  }
  if (env.OPENAI_API_KEY) {
    return callOpenAi(env, messages, maxTokens, temperature)
  }
  if (env.AI) {
    return callWorkersAi(env, messages, maxTokens, temperature)
  }
  throw new Error(
    'No AI provider is configured. Add a GEMINI_API_KEY secret on the Worker, or enter a Gemini API key in Settings.',
  )
}

const callOpenAi = async (
  env: Env,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<AiResult> => {
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 300)}`)
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = payload.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenAI returned an empty response.')
  return { text, model: `openai/${model}` }
}

const callWorkersAi = async (
  env: Env,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<AiResult> => {
  if (!env.AI) throw new Error('Workers AI binding is not configured.')
  const model = env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL
  const result = (await env.AI.run(model, {
    messages,
    max_tokens: maxTokens,
    temperature,
  })) as { response?: string } | string
  const text = typeof result === 'string' ? result : result?.response
  if (!text) throw new Error('Workers AI returned an empty response.')
  return { text, model: `workers-ai/${model}` }
}

/** Extract the first JSON object/array from a model response, tolerating fences. */
export const extractJson = <T>(raw: string): T | null => {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json|cpp|c|python|py)?/gi, '')
    .replace(/```/g, '')
    .trim()

  const candidates: string[] = [cleaned]
  const objectStart = cleaned.indexOf('{')
  const objectEnd = cleaned.lastIndexOf('}')
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1))
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

export const safeStringArray = (value: unknown, limit = 12): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

export const sanitizeFilename = (value: unknown, fallback: string): string => {
  const raw = typeof value === 'string' ? value : ''
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || fallback
}

export const estimatePromptSize = (value: unknown): number =>
  typeof value === 'string' ? value.length : JSON.stringify(value ?? '').length

/** Compact, human-readable wiring context for the model. */
export const describeConnections = (
  connections: Array<{
    boardPin?: string
    boardPinLabel?: string
    component?: string
    componentPin?: string
    role?: string
  }>,
  limit = 90,
): string =>
  connections
    .slice(0, limit)
    .map(
      (connection) =>
        `${connection.component ?? 'component'} ${connection.componentPin ?? 'pin'} -> board ${
          connection.boardPinLabel ?? connection.boardPin ?? '?'
        }${connection.boardPin && connection.boardPinLabel ? ` (GPIO ${connection.boardPin})` : ''} [${connection.role ?? 'signal'}]`,
    )
    .join('\n')
