import { GEMINI_MODEL, getGeminiModel } from './settings'

export type GeminiConnectionState =
  | 'connected'
  | 'disconnected'
  | 'invalid-key'
  | 'rate-limited'
  | 'error'

export interface GeminiStatus {
  configured: boolean
  source: 'user' | 'server' | 'none'
  model: string
  serverConfigured: boolean
  instructions?: string
}

export interface GeminiProbe {
  ok: boolean
  state: GeminiConnectionState
  message: string
  model: string
  source: 'user' | 'server' | 'none'
  latencyMs: number
}

export interface GeminiModelList {
  models: string[]
  recommended: string | null
  configuredModel: string
  error?: string
}

const fallbackProbe = (message: string): GeminiProbe => ({
  ok: false,
  state: 'error',
  message,
  model: GEMINI_MODEL,
  source: 'none',
  latencyMs: 0,
})

const fallbackModels = (message: string): GeminiModelList => ({
  models: [],
  recommended: null,
  configuredModel: GEMINI_MODEL,
  error: message,
})

/**
 * Build the model header. `undefined` means "use the model saved in Settings",
 * `null` means "do not send a model and let the server choose its default".
 */
const modelHeaders = (model?: string | null): Record<string, string> => {
  const selected = model === undefined ? getGeminiModel() : model
  const cleaned = selected ? selected.trim().replace(/^models\//, '') : ''
  return cleaned ? { 'x-gemini-model': cleaned } : {}
}

export async function getGeminiStatus(): Promise<GeminiStatus | null> {
  try {
    const response = await fetch('/api/gemini/status', {
      headers: { accept: 'application/json', ...modelHeaders() },
      cache: 'no-store',
    })
    if (!response.ok) return null
    return (await response.json()) as GeminiStatus
  } catch {
    return null
  }
}

/**
 * Ask the Worker which Gemini text models this key can use. The typed key is
 * sent in a header, proxied to Google, and never echoed back.
 */
export async function findGeminiModels(key?: string | null): Promise<GeminiModelList> {
  const typedKey = key?.trim() || ''
  try {
    const response = await fetch('/api/gemini/models', {
      headers: {
        accept: 'application/json',
        ...(typedKey ? { 'x-gemini-api-key': typedKey } : {}),
        ...modelHeaders(),
      },
      cache: 'no-store',
    })
    const data = (await response.json().catch(() => null)) as {
      models?: unknown
      recommended?: unknown
      configuredModel?: unknown
      error?: unknown
    } | null
    if (!response.ok || !data) {
      const message =
        data && typeof data.error === 'string'
          ? data.error
          : `The model list request failed with HTTP ${response.status}.`
      return fallbackModels(message)
    }
    const models = Array.isArray(data.models)
      ? data.models.filter((name): name is string => typeof name === 'string' && name.length > 0)
      : []
    return {
      models,
      recommended: typeof data.recommended === 'string' ? data.recommended : null,
      configuredModel: typeof data.configuredModel === 'string' ? data.configuredModel : GEMINI_MODEL,
    }
  } catch {
    return fallbackModels('Could not reach the model list endpoint. Check the deployment and try again.')
  }
}

/**
 * Validate the key and the selected model. Pass `model: null` to let the Worker
 * use its default model; omit it to use the model saved in Settings.
 */
export async function testGeminiConnection(
  key?: string | null,
  model?: string | null,
): Promise<GeminiProbe> {
  const typedKey = key?.trim() || ''
  try {
    const response = await fetch('/api/gemini/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(typedKey ? { 'x-gemini-api-key': typedKey } : {}),
        ...modelHeaders(model),
      },
      body: JSON.stringify(typedKey ? { key: typedKey } : {}),
    })
    const data = (await response.json().catch(() => null)) as Partial<GeminiProbe> | null
    if (!response.ok || !data) {
      return fallbackProbe(
        data?.message || 'The Gemini test endpoint could not be reached. Check the deployment and try again.',
      )
    }
    return {
      ok: Boolean(data.ok),
      state: (data.state as GeminiConnectionState) || 'error',
      message: data.message || 'No diagnostic message was returned.',
      model: data.model || GEMINI_MODEL,
      source: data.source || 'none',
      latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : 0,
    }
  } catch {
    return fallbackProbe(
      'The Gemini test endpoint could not be reached. The local engine and your saved projects still work.',
    )
  }
}
