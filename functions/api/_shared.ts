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
export const GEMINI_MODEL_HEADER = 'x-gemini-model'

export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

const baseHeaders = (env?: Env): Record<string, string> => ({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': env?.ALLOWED_ORIGIN || '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type, x-gemini-api-key, x-gemini-model, authorization',
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

/**
 * Candidates tried only after Google confirms that the configured model is not
 * available to the key. Every candidate is checked against the key's own
 * ListModels response first, so this never guesses blindly.
 */
const GEMINI_MODEL_PREFERENCES = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-002',
]

const NON_TEXT_GEMINI_MODEL = /(?:embedding|aqa|imagen|veo|tts|audio|live|image)/i
const geminiModelCache = new Map<string, string>()

const normalizeGeminiModel = (value: string): string => value.trim().replace(/^models\//, '')

/**
 * Cache key for the resolved model. This is a non-cryptographic hash so raw API
 * keys are never retained in the model cache.
 */
const geminiCacheKey = (apiKey: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < apiKey.length; index += 1) {
    hash ^= apiKey.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

const rememberGeminiModel = (apiKey: string, model: string): void => {
  const key = geminiCacheKey(apiKey)
  if (!geminiModelCache.has(key) && geminiModelCache.size >= 32) {
    const oldest = geminiModelCache.keys().next().value
    if (oldest) geminiModelCache.delete(oldest)
  }
  geminiModelCache.set(key, model)
}

const recallGeminiModel = (apiKey: string): string | undefined => geminiModelCache.get(geminiCacheKey(apiKey))

const pickGeminiModel = (available: string[], preferred: string, exclude?: string): string | null => {
  const blocked = exclude ? normalizeGeminiModel(exclude) : ''
  const usable = available.filter((name) => name !== blocked)
  const names = new Set(usable)
  const wanted = normalizeGeminiModel(preferred)
  if (wanted && names.has(wanted)) return wanted
  for (const candidate of GEMINI_MODEL_PREFERENCES) {
    if (candidate !== blocked && names.has(candidate)) return candidate
  }
  return (
    usable.find((name) => /flash/i.test(name) && !NON_TEXT_GEMINI_MODEL.test(name)) ??
    usable.find((name) => !NON_TEXT_GEMINI_MODEL.test(name)) ??
    null
  )
}

/**
 * Read the models available to a key. Only models that support generateContent
 * are returned, newest/most capable first as reported by Google.
 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const response = await fetch(
    `${GEMINI_BASE}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
    { headers: { accept: 'application/json' } },
  )
  if (!response.ok) {
    const detail = redactSecret(await response.text().catch(() => ''), apiKey)
    throw new Error(
      `Google's model list returned HTTP ${response.status}. ${detail.slice(0, 180)}`.trim(),
    )
  }
  const payload = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
  }
  return (payload.models ?? [])
    .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((model) => normalizeGeminiModel(model.name ?? ''))
    .filter(Boolean)
}

/** Choose a usable model for a key, optionally excluding a model that just failed. */
export async function resolveGeminiModel(
  apiKey: string,
  preferred: string,
  exclude?: string,
): Promise<{ model: string | null; available: string[] }> {
  const available = await listGeminiModels(apiKey)
  return { model: pickGeminiModel(available, preferred, exclude), available }
}

const requestedGeminiModel = (request: Request): string => {
  const value = (request.headers.get(GEMINI_MODEL_HEADER) || '').trim().replace(/^models\//, '')
  return /^[A-Za-z0-9][A-Za-z0-9._-]{1,100}$/.test(value) ? value : ''
}

/** Resolve the Gemini key without ever exposing it to the caller's response. */
export const resolveGeminiKey = (context: { env: Env; request: Request }): GeminiKeyResolution => {
  const header = (context.request.headers.get(GEMINI_API_KEY_HEADER) || '').trim()
  const server = (context.env.GEMINI_API_KEY || '').trim()
  const model = requestedGeminiModel(context.request) || geminiModel(context.env)
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

/**
 * Google answers 429/500/502/503/504 for conditions that usually clear on their
 * own (quota windows, model demand spikes). These are retried with a short
 * backoff instead of being reported as a configuration problem.
 */
const TRANSIENT_GEMINI_STATUS = new Set([429, 500, 502, 503, 504])
const GEMINI_RETRY_DELAYS = [700, 1600]

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Pull Google's human-readable error message out of an error response body. */
const geminiErrorSummary = (detail: string): string => {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } }
    const message = parsed.error?.message?.trim()
    if (message) return message.length > 180 ? `${message.slice(0, 177)}…` : message
  } catch {
    // Not JSON: fall through to the compacted raw text.
  }
  const compact = detail.replace(/\s+/g, ' ').trim()
  return compact.length > 180 ? `${compact.slice(0, 177)}…` : compact
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
      message:
        'The key is valid, but Gemini is rate limiting requests right now. Wait a minute and test again — the key and model do not need to change.',
    }
  }
  if (status === 502 || status === 503 || status === 504) {
    const note = geminiErrorSummary(detail).replace(/[.\s]+$/, '')
    return {
      state: 'rate-limited',
      message: `Gemini is temporarily unavailable (HTTP ${status})${note ? `: ${note}` : ''}. The key and the model are fine — wait a moment and test again.`,
    }
  }
  if (status === 500) {
    const note = geminiErrorSummary(detail).replace(/[.\s]+$/, '')
    return {
      state: 'error',
      message: `Gemini returned a temporary server error (HTTP 500)${note ? `: ${note}` : ''}. Try again shortly — the key and model do not need to change.`,
    }
  }
  if (status === 404) {
    return {
      state: 'error',
      message:
        'The configured Gemini model is not available for this key. The app will try a model the key can access; if that also fails, click Find models and choose one of the listed models.',
    }
  }
  const note = geminiErrorSummary(detail)
  return {
    state: 'error',
    message: `Gemini returned HTTP ${status}${note ? `: ${note}` : ''}`,
  }
}

export type GeminiProbeState = 'connected' | 'invalid-key' | 'rate-limited' | 'error'

export interface GeminiProbeResult {
  state: GeminiProbeState
  message: string
  model: string
  latencyMs: number
}

interface GeminiHttpResult {
  ok: boolean
  status: number
  networkError: boolean
  detail: string
}

const requestGeminiProbe = async (apiKey: string, model: string): Promise<GeminiHttpResult> => {
  try {
    const response = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        }),
      },
    )
    const raw = await response.text().catch(() => '')
    return {
      ok: response.ok,
      status: response.status,
      networkError: false,
      detail: redactSecret(raw, apiKey),
    }
  } catch {
    return { ok: false, status: 0, networkError: true, detail: '' }
  }
}

/**
 * Retry transient Google failures (overloaded model, quota window, gateway
 * error) with a short backoff before treating them as a real failure.
 */
const requestGeminiProbeWithRetry = async (
  apiKey: string,
  model: string,
): Promise<GeminiHttpResult> => {
  let result = await requestGeminiProbe(apiKey, model)
  for (const delay of GEMINI_RETRY_DELAYS) {
    if (result.ok || result.networkError || !TRANSIENT_GEMINI_STATUS.has(result.status)) break
    await sleep(delay)
    result = await requestGeminiProbe(apiKey, model)
  }
  return result
}

/**
 * Validate a Gemini key with the smallest useful request possible. The key is
 * only ever sent to Google; the result describes connectivity and never
 * contains the credential.
 *
 * If Google reports the configured model as unavailable (HTTP 404), the key's
 * own model list is used to pick an equivalent model and the request is retried
 * once. Older keys and keys restricted to specific models keep working without
 * manual configuration.
 */
export async function probeGemini(apiKey: string, model: string): Promise<GeminiProbeResult> {
  const started = Date.now()
  const configured = normalizeGeminiModel(model) || DEFAULT_GEMINI_MODEL
  const first = await requestGeminiProbeWithRetry(apiKey, configured)

  if (first.ok) {
    const latencyMs = Date.now() - started
    return {
      state: 'connected',
      message: `Connected to gemini/${configured} in ${latencyMs} ms.`,
      model: configured,
      latencyMs,
    }
  }

  if (first.networkError) {
    return {
      state: 'error',
      message:
        'Could not reach the Gemini API. Check the deployment network access and try again — the key may still be valid.',
      model: configured,
      latencyMs: Date.now() - started,
    }
  }

  if (first.status === 404) {
    let resolution: { model: string | null; available: string[] } | null = null
    try {
      resolution = await resolveGeminiModel(apiKey, configured, configured)
    } catch {
      resolution = null
    }

    if (resolution?.model && resolution.model !== configured) {
      const retry = await requestGeminiProbeWithRetry(apiKey, resolution.model)
      const latencyMs = Date.now() - started
      if (retry.ok) {
        rememberGeminiModel(apiKey, resolution.model)
        return {
          state: 'connected',
          message: `Connected to gemini/${resolution.model} in ${latencyMs} ms. gemini/${configured} is not available for this key, so the closest available model was selected automatically.`,
          model: resolution.model,
          latencyMs,
        }
      }
      if (retry.networkError || TRANSIENT_GEMINI_STATUS.has(retry.status)) {
        return {
          state: 'rate-limited',
          message: `gemini/${configured} is not available for this key, and gemini/${resolution.model} is temporarily unavailable (${retry.networkError ? 'Google could not be reached' : `HTTP ${retry.status}`}). The key itself was accepted — wait a moment and test again.`,
          model: resolution.model,
          latencyMs,
        }
      }
      return {
        state: 'error',
        message: `The key was accepted, but neither gemini/${configured} nor gemini/${resolution.model} could be used (HTTP ${retry.status}). Enable a Gemini text model for this key's project in Google AI Studio, then click Find models and choose one.`,
        model: resolution.model,
        latencyMs,
      }
    }

    const alternatives = resolution?.available.filter((name) => name !== configured) ?? []
    const availableNote = resolution
      ? resolution.available.includes(configured)
        ? `Google lists gemini/${configured}, but rejects generateContent for this key.${
            alternatives.length ? ` Other text models: ${alternatives.slice(0, 5).join(', ')}.` : ''
          }`
        : resolution.available.length
          ? `Text models Google reports for this key: ${resolution.available.slice(0, 6).join(', ')}.`
          : 'Google reports no text-generation models for this key.'
      : "Google's model list could not be read for this key."
    return {
      state: 'error',
      message: `gemini/${configured} is not available for this key. ${availableNote} Enable a Gemini text model for the key's project in Google AI Studio, then click Find models and choose one.`,
      model: configured,
      latencyMs: Date.now() - started,
    }
  }

  const failure = describeGeminiFailure(first.status, first.detail)
  return { ...failure, model: configured, latencyMs: Date.now() - started }
}

class GeminiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GeminiRequestError'
    this.status = status
  }
}

const callGeminiOnce = async (
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
    throw new GeminiRequestError(`Gemini: ${failure.message}`, response.status)
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned an empty response.')
  return { text, model: `gemini/${model}` }
}

const callGemini = async (
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<AiResult> => {
  const configured = normalizeGeminiModel(model) || DEFAULT_GEMINI_MODEL
  const cached = recallGeminiModel(apiKey)
  const firstModel = cached || configured

  const callWithRetry = async (modelName: string): Promise<AiResult> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await callGeminiOnce(apiKey, modelName, messages, maxTokens, temperature)
      } catch (error) {
        const transient = error instanceof GeminiRequestError && TRANSIENT_GEMINI_STATUS.has(error.status)
        if (!transient || attempt >= GEMINI_RETRY_DELAYS.length) throw error
        await sleep(GEMINI_RETRY_DELAYS[attempt])
      }
    }
  }

  try {
    return await callWithRetry(firstModel)
  } catch (error) {
    if (!(error instanceof GeminiRequestError) || error.status !== 404) throw error

    let resolution: { model: string | null; available: string[] } | null = null
    try {
      resolution = await resolveGeminiModel(apiKey, configured, firstModel)
    } catch {
      resolution = null
    }
    const fallback = resolution?.model
    if (!fallback || fallback === firstModel) throw error

    const result = await callWithRetry(fallback)
    rememberGeminiModel(apiKey, fallback)
    return result
  }
}

export async function callAi(
  env: Env,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number } = {},
  geminiApiKey?: string,
  geminiModelOverride?: string,
): Promise<AiResult> {
  const maxTokens = options.maxTokens ?? 4096
  const temperature = options.temperature ?? 0.2
  const model = normalizeGeminiModel(geminiModelOverride || '') || geminiModel(env)
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
