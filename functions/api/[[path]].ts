import { fail, options, type Env } from './_shared'

/**
 * Catch-all for unknown /api routes. Without this, Pages serves the SPA shell
 * with a 200 for typos and the client silently gets HTML instead of JSON.
 */
export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequest: PagesFunction<Env> = async (context) =>
  fail('Unknown API route. Call GET /api/health for the endpoint list.', 404, context.env)
