import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  geminiModel,
  json,
  options,
  type Env,
} from './_shared'

export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const workersAi = Boolean(context.env.AI)
  const openai = Boolean(context.env.OPENAI_API_KEY)
  const gemini = Boolean(context.env.GEMINI_API_KEY)
  const model = gemini
    ? `gemini/${geminiModel(context.env)}`
    : openai
      ? `openai/${context.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL}`
      : workersAi
        ? `workers-ai/${context.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL}`
        : null

  return json(
    {
      ok: true,
      service: 'makerwire-ai',
      time: new Date().toISOString(),
      ai: {
        workersAi,
        openai,
        gemini,
        geminiModel: geminiModel(context.env),
        model,
        order: gemini
          ? 'user key → gemini server key → openai → workers-ai'
          : openai
            ? 'user key → openai → workers-ai'
            : workersAi
              ? 'user key → workers-ai'
              : 'user key via Settings → local only',
      },
      endpoints: [
        'POST /api/generate-code',
        'POST /api/generate-wiring',
        'POST /api/lookup-component',
        'GET /api/gemini/status',
        'POST /api/gemini/test',
        'GET /api/gemini/models',
        'GET /api/catalog/boards',
        'GET /api/catalog/components',
        'GET /api/health',
      ],
    },
    200,
    context.env,
  )
}
