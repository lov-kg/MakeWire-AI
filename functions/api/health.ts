import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  json,
  options,
  type Env,
} from './_shared'

export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const workersAi = Boolean(context.env.AI)
  const openai = Boolean(context.env.OPENAI_API_KEY)
  return json(
    {
      ok: true,
      service: 'makerwire-ai',
      time: new Date().toISOString(),
      ai: {
        workersAi,
        openai,
        model: openai
          ? `openai/${context.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL}`
          : workersAi
            ? `workers-ai/${context.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL}`
            : null,
        order: openai ? 'openai → workers-ai' : workersAi ? 'workers-ai' : 'local only',
      },
      endpoints: [
        'POST /api/generate-code',
        'POST /api/generate-wiring',
        'POST /api/lookup-component',
        'GET /api/catalog/boards',
        'GET /api/catalog/components',
        'GET /api/health',
      ],
    },
    200,
    context.env,
  )
}
