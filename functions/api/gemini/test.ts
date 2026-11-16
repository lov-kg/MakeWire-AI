import {
  clampText,
  fail,
  json,
  options,
  probeGemini,
  readJson,
  resolveGeminiKey,
  type Env,
} from '../_shared'

interface TestBody {
  key?: string
}

/**
 * Validates a Gemini key through the API function. The key is either the
 * one supplied in this request (never persisted server-side), the request
 * header from Settings, or GEMINI_API_KEY. Responses never contain the key.
 */
export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: TestBody = {}
  try {
    body = await readJson<TestBody>(context.request)
  } catch {
    // A missing body is fine: fall back to the header or server key.
    body = {}
  }

  const supplied = clampText(body.key, 400).trim()
  const gemini = resolveGeminiKey(context)
  const key = supplied || gemini.key
  const source = supplied ? (gemini.source === 'none' ? 'user' : gemini.source) : gemini.source
  const model = gemini.model

  if (!key) {
    return json(
      {
        ok: false,
        state: 'disconnected',
        message:
          'No Gemini key is configured. Paste a key in Settings or set the GEMINI_API_KEY secret on the Worker.',
        model,
        source: 'none',
        latencyMs: 0,
      },
      200,
      context.env,
    )
  }

  if (key.length < 20 || key.length > 400 || /\s/.test(key)) {
    return json(
      {
        ok: false,
        state: 'invalid-key',
        message: 'That does not look like a complete Gemini API key. Copy the full key from Google AI Studio.',
        model,
        source,
        latencyMs: 0,
      },
      200,
      context.env,
    )
  }

  try {
    const result = await probeGemini(key, model)
    return json(
      {
        ok: result.state === 'connected',
        state: result.state,
        message: result.message,
        model: result.model,
        source,
        latencyMs: result.latencyMs,
      },
      200,
      context.env,
    )
  } catch {
    return fail('The Gemini connection test failed unexpectedly. Try again.', 500, context.env)
  }
}
