import { json, options, resolveGeminiKey, type Env } from '../_shared'

/**
 * Reports whether Gemini is configured, without validating the key or ever
 * returning any part of it. The browser calls this on boot to render the
 * integration status.
 */
export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const gemini = resolveGeminiKey(context)
  return json(
    {
      ok: true,
      configured: Boolean(gemini.key),
      source: gemini.source,
      model: gemini.model,
      serverConfigured: Boolean(context.env.GEMINI_API_KEY),
      instructions:
        gemini.source === 'none'
          ? 'Add a Gemini API key in Settings, or set the GEMINI_API_KEY secret on the Worker.'
          : undefined,
    },
    200,
    context.env,
  )
}
