import { fail, json, options, resolveGeminiKey, resolveGeminiModel, type Env } from '../_shared'

export const onRequestOptions = async (context: { env: Env }) => options(context.env)

/**
 * Lists the Gemini text models available to the configured key. Useful for
 * diagnosing model-access mismatches; the key is only sent to Google and is
 * never echoed back.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const gemini = resolveGeminiKey(context)

  if (!gemini.key) {
    return json(
      {
        ok: true,
        configured: false,
        source: 'none',
        configuredModel: gemini.model,
        recommended: null,
        models: [],
        message: 'Add a Gemini API key in Settings or set GEMINI_API_KEY on the Worker.',
      },
      200,
      context.env,
    )
  }

  try {
    const { model, available } = await resolveGeminiModel(gemini.key, gemini.model)
    return json(
      {
        ok: true,
        configured: true,
        source: gemini.source,
        configuredModel: gemini.model,
        recommended: model,
        count: available.length,
        models: available,
      },
      200,
      context.env,
    )
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : 'Could not read the Gemini model list.',
      502,
      context.env,
    )
  }
}
