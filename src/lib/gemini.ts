import { GEMINI_MODEL } from './settings'

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

const fallbackProbe = (message: string): GeminiProbe => ({
  ok: false,
  state: 'error',
  message,
  model: GEMINI_MODEL,
  source: 'none',
  latencyMs: 0,
})

export async function getGeminiStatus(): Promise<GeminiStatus | null> {
  try {
    const response = await fetch('/api/gemini/status', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) return null
    return (await response.json()) as GeminiStatus
  } catch {
    return null
  }
}

/**
 * Validate the key through the API function. The typed key is sent in the
 * request body over the same origin; the function never echoes it back.
 */
export async function testGeminiConnection(key?: string | null): Promise<GeminiProbe> {
  try {
    const response = await fetch('/api/gemini/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(key?.trim() ? { key: key.trim() } : {}),
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
