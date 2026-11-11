/**
 * Shared helpers for MakerWire AI Pages Functions.
 *
 * Bindings (set in the Cloudflare dashboard or wrangler.toml):
 *   AI                 Workers AI binding
 *   OPENAI_API_KEY     optional secret; when present OpenAI is used first
 *   OPENAI_MODEL       optional, defaults to gpt-4o-mini
 *   WORKERS_AI_MODEL   optional, defaults to a Llama 3.3 instruct model
 */

export interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

export interface Env {
  AI?: AiBinding
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  WORKERS_AI_MODEL?: string
  ALLOWED_ORIGIN?: string
  /** Static asset binding provided by Cloudflare Pages. */
  ASSETS?: { fetch: (input: string | URL | Request) => Promise<Response> }
}

export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

const baseHeaders = (env?: Env): Record<string, string> => ({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': env?.ALLOWED_ORIGIN || '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
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

export const aiConfigured = (env: Env): boolean => Boolean(env.OPENAI_API_KEY || env.AI)

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

export async function callAi(
  env: Env,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<AiResult> {
  const maxTokens = options.maxTokens ?? 4096
  const temperature = options.temperature ?? 0.2
  if (env.OPENAI_API_KEY) {
    return callOpenAi(env, messages, maxTokens, temperature)
  }
  if (env.AI) {
    return callWorkersAi(env, messages, maxTokens, temperature)
  }
  throw new Error('No AI provider is configured. Add a Workers AI binding or an OPENAI_API_KEY secret.')
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
