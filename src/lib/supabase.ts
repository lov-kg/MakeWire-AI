import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceData } from '../types'
import {
  getCurrentCloudSettings,
  getSupabaseConfig,
  parseCloudSettings,
  type CloudSettings,
  type SupabaseConfig,
} from './settings'
import { isWorkspace, normalizeWorkspace } from './storage'

export const SYNC_TABLE = 'makerwire_workspaces'

export type CloudConnectionState =
  | 'disconnected'
  | 'configured'
  | 'checking'
  | 'connected'
  | 'invalid-key'
  | 'schema-missing'
  | 'error'

export interface CloudSession {
  userId: string
  email: string | null
  expiresAt: number | null
  accessToken: string | null
}

export interface CloudTestResult {
  ok: boolean
  state: CloudConnectionState
  message: string
  schemaReady: boolean
  latencyMs: number
}

export interface RemoteWorkspaceMeta {
  updatedAt: string | null
  clientUpdatedAt: string | null
}

interface CacheEntry {
  signature: string
  client: SupabaseClient
}

let cache: CacheEntry | null = null
let pending: Promise<SupabaseClient | null> | null = null

const signatureOf = (config: SupabaseConfig): string => `${config.url}::${config.anonKey}`

/**
 * Lazily load the Supabase client so the base app stays small and fully
 * usable offline. Changing the URL/key creates a new client.
 */
export async function getSupabaseClient(config?: SupabaseConfig | null): Promise<SupabaseClient | null> {
  const target = config ?? getSupabaseConfig()
  if (!target) return null
  const signature = signatureOf(target)
  if (cache && cache.signature === signature) return cache.client
  if (pending) return pending
  pending = import('@supabase/supabase-js')
    .then(({ createClient }) => {
      const client = createClient(target.url, target.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
          storageKey: 'makerwire:supabase:auth',
        },
        global: { headers: { 'x-application-name': 'makerwire-ai' } },
      })
      cache = { signature, client }
      return client
    })
    .catch(() => null)
    .finally(() => {
      pending = null
    })
  return pending
}

const toSession = (session: Session | null): CloudSession | null =>
  session
    ? {
        userId: session.user.id,
        email: session.user.email ?? null,
        expiresAt: session.expires_at ?? null,
        accessToken: session.access_token ?? null,
      }
    : null

export function describeSupabaseError(error: unknown): string {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : error instanceof Error
        ? error.message
        : 'Unknown Supabase error.'
  if (/invalid api key|invalid jwt|jwt expired|no api key/i.test(raw)) {
    return 'Supabase rejected the public key or session. Check the anon/publishable key and sign in again.'
  }
  if (/does not exist|schema cache|could not find the table|relation .* not found/i.test(raw)) {
    return `The cloud table is missing. Run supabase/schema.sql in the Supabase SQL editor to create ${SYNC_TABLE} with RLS.`
  }
  if (/email not confirmed/i.test(raw)) {
    return 'Confirm your email address from the Supabase email, then sign in again.'
  }
  if (/failed to fetch|networkerror|network error|fetch failed/i.test(raw)) {
    return 'The browser could not reach Supabase. Check the Project URL and your connection.'
  }
  return raw
}

/** Verify the project URL/key and whether the sync table + RLS exist. */
export async function testSupabaseConnection(
  config: SupabaseConfig,
  accessToken?: string | null,
): Promise<CloudTestResult> {
  const started = Date.now()
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    accept: 'application/json',
  }
  // Prefer the signed-in session token when available so RLS is exercised as
  // the real user. Otherwise fall back to the anon JWT or publishable key.
  if (accessToken) headers.authorization = `Bearer ${accessToken}`
  else if (config.anonKey.startsWith('eyJ')) headers.authorization = `Bearer ${config.anonKey}`
  try {
    const settings = await fetch(`${config.url}/auth/v1/settings`, { headers, cache: 'no-store' })
    if (settings.status === 401 || settings.status === 403) {
      return {
        ok: false,
        state: 'invalid-key',
        message: 'Supabase rejected the public key. Use the anon/publishable key from Project Settings → API.',
        schemaReady: false,
        latencyMs: Date.now() - started,
      }
    }
    if (!settings.ok) {
      return {
        ok: false,
        state: 'error',
        message: `Supabase auth returned HTTP ${settings.status}. Check the Project URL.`,
        schemaReady: false,
        latencyMs: Date.now() - started,
      }
    }

    const table = await fetch(
      `${config.url}/rest/v1/${SYNC_TABLE}?select=user_id&limit=1`,
      { headers, cache: 'no-store' },
    )
    const latencyMs = Date.now() - started
    if (table.ok) {
      return {
        ok: true,
        state: 'connected',
        message: `Connected to Supabase in ${latencyMs} ms. The sync table and RLS are reachable.`,
        schemaReady: true,
        latencyMs,
      }
    }
    const detail = await table.text().catch(() => '')
    if (
      table.status === 404 ||
      /PGRST205|does not exist|schema cache|could not find the table/i.test(detail)
    ) {
      return {
        ok: true,
        state: 'schema-missing',
        message: 'Connected to Supabase, but the sync table is missing. Run supabase/schema.sql once.',
        schemaReady: false,
        latencyMs,
      }
    }
    // The key is proven valid by the auth probe above. An anonymous request is
    // expected to be blocked by RLS once schema.sql has revoked anon access, so
    // a permission error means the table exists and is protected — not that the
    // key is wrong. Signing in is what proves read/write access.
    if (table.status === 401 || table.status === 403) {
      return {
        ok: true,
        state: 'connected',
        message: accessToken
          ? `Connected, but reading ${SYNC_TABLE} was denied for this account. Re-run supabase/schema.sql to install the RLS policies.`
          : 'Connected to Supabase. The table is protected by RLS; sign in to verify sync access.',
        schemaReady: false,
        latencyMs,
      }
    }
    return {
      ok: false,
      state: 'error',
      message: `Supabase REST returned HTTP ${table.status}. ${detail.slice(0, 180)}`.trim(),
      schemaReady: false,
      latencyMs,
    }
  } catch {
    return {
      ok: false,
      state: 'error',
      message: 'Could not reach Supabase. Verify the Project URL and that the project is not paused.',
      schemaReady: false,
      latencyMs: Date.now() - started,
    }
  }
}

export async function getCloudSession(): Promise<CloudSession | null> {
  const client = await getSupabaseClient()
  if (!client) return null
  try {
    const { data, error } = await client.auth.getSession()
    if (error) return null
    return toSession(data.session)
  } catch {
    return null
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ session: CloudSession | null; error: string | null }> {
  const client = await getSupabaseClient()
  if (!client) return { session: null, error: 'Add and save your Supabase project first.' }
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return { session: null, error: describeSupabaseError(error) }
  return { session: toSession(data.session), error: null }
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ session: CloudSession | null; needsConfirmation: boolean; error: string | null }> {
  const client = await getSupabaseClient()
  if (!client) {
    return { session: null, needsConfirmation: false, error: 'Add and save your Supabase project first.' }
  }
  const { data, error } = await client.auth.signUp({ email: email.trim(), password })
  if (error) return { session: null, needsConfirmation: false, error: describeSupabaseError(error) }
  return {
    session: toSession(data.session),
    needsConfirmation: !data.session,
    error: null,
  }
}

export async function signOutFromCloud(): Promise<void> {
  const client = await getSupabaseClient()
  if (!client) return
  try {
    await client.auth.signOut()
  } catch {
    // Local session is cleared by the SDK even if the network call fails.
  }
}

export async function subscribeToAuth(
  callback: (session: CloudSession | null) => void,
): Promise<() => void> {
  const client = await getSupabaseClient()
  if (!client) return () => undefined
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(toSession(session))
  })
  return () => data.subscription.unsubscribe()
}

export const workspaceUpdatedAt = (workspace: WorkspaceData): string | null => {
  let latest: string | null = null
  for (const project of workspace.projects) {
    if (!project.updatedAt) continue
    if (!latest || project.updatedAt > latest) latest = project.updatedAt
  }
  return latest
}

export async function fetchRemoteMeta(): Promise<RemoteWorkspaceMeta | null> {
  const client = await getSupabaseClient()
  if (!client) return null
  const session = await getCloudSession()
  if (!session) return null
  const { data, error } = await client
    .from(SYNC_TABLE)
    .select('updated_at, client_updated_at')
    .eq('user_id', session.userId)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error))
  if (!data) return null
  const row = data as { updated_at?: string | null; client_updated_at?: string | null }
  return {
    updatedAt: row.updated_at ?? null,
    clientUpdatedAt: row.client_updated_at ?? null,
  }
}

/** A full Supabase snapshot: the workspace plus every syncable app setting. */
export type CloudWorkspaceSnapshot = WorkspaceData & { settings?: CloudSettings }

export async function pushWorkspaceToCloud(
  workspace: WorkspaceData,
  settings: CloudSettings | null = getCurrentCloudSettings(),
): Promise<{ updatedAt: string }> {
  const client = await getSupabaseClient()
  if (!client) throw new Error('Add and save your Supabase project first.')
  const session = await getCloudSession()
  if (!session) throw new Error('Sign in to Supabase before syncing.')
  const now = new Date().toISOString()
  const snapshot: CloudWorkspaceSnapshot = settings ? { ...workspace, settings } : workspace
  const { error } = await client.from(SYNC_TABLE).upsert(
    {
      user_id: session.userId,
      data: snapshot,
      client_updated_at: workspaceUpdatedAt(workspace) ?? now,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(describeSupabaseError(error))
  return { updatedAt: now }
}

export async function pullWorkspaceFromCloud(): Promise<{
  workspace: WorkspaceData
  settings: CloudSettings | null
  clientUpdatedAt: string | null
} | null> {
  const client = await getSupabaseClient()
  if (!client) throw new Error('Add and save your Supabase project first.')
  const session = await getCloudSession()
  if (!session) throw new Error('Sign in to Supabase before restoring.')
  const { data, error } = await client
    .from(SYNC_TABLE)
    .select('data, client_updated_at')
    .eq('user_id', session.userId)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error))
  if (!data) return null
  const row = data as { data?: unknown; client_updated_at?: string | null }
  if (!isWorkspace(row.data)) {
    throw new Error('The cloud copy is not a valid MakerWire workspace. Export a backup before trying again.')
  }
  const snapshot = row.data as CloudWorkspaceSnapshot
  return {
    workspace: normalizeWorkspace(snapshot),
    settings: parseCloudSettings(snapshot.settings),
    clientUpdatedAt: row.client_updated_at ?? null,
  }
}
