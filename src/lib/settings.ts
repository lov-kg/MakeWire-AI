/**
 * MakerWire AI — local settings.
 *
 * User-entered secrets live in localStorage, never in source or the bundle:
 * they are read at runtime. Gemini keys are only forwarded to the same-origin
 * API function, which proxies them to Google. Supabase uses the *public*
 * anon/publishable key and Row Level Security; service-role keys are rejected.
 */

const LS_GEMINI_KEY = 'makerwire:gemini:apiKey'
const LS_GEMINI_MODEL = 'makerwire:gemini:model'
const LS_SUPABASE_CONFIG = 'makerwire:supabase:config'
const LS_SUPABASE_AUTO_SYNC = 'makerwire:supabase:autoSync'
const LS_SUPABASE_LAST_SYNC = 'makerwire:supabase:lastSync'
const LS_PREFERENCES = 'makerwire:preferences:v1'

export const GEMINI_MODEL = 'gemini-2.5-flash'
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

const safeGet = (key: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSet = (key: string, value: string): boolean => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const safeRemove = (key: string): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage disabled — nothing to clear.
  }
}

/* ------------------------------------------------------------------ */
/* Gemini                                                              */
/* ------------------------------------------------------------------ */

/**
 * Google keys usually start with "AIza". Newer keys and relay tokens vary in
 * shape, so the server-side probe is the authoritative validation; here we
 * only reject obviously malformed input.
 */
export const isGeminiApiKey = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:AIza[A-Za-z0-9_-]{20,}|[A-Za-z0-9._-]{20,})$/.test(value.trim())

export const maskSecret = (value: string | null): string => {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`
}

/** Show the host of a Supabase project without leaking the full config. */
export const maskSupabaseUrl = (value: string | null): string => {
  if (!value) return ''
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

export const getGeminiApiKey = (): string | null => {
  const value = safeGet(LS_GEMINI_KEY)
  return value ? value.trim() : null
}

export const setGeminiApiKey = (value: string): boolean => {
  const cleaned = value.trim()
  if (!isGeminiApiKey(cleaned)) return false
  return safeSet(LS_GEMINI_KEY, cleaned)
}

export const clearGeminiApiKey = (): void => safeRemove(LS_GEMINI_KEY)

export const hasStoredGeminiKey = (): boolean => getGeminiApiKey() !== null

/** Gemini model names are simple identifiers such as `gemini-2.5-flash`. */
export const isGeminiModelName = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{1,100}$/.test(value.trim().replace(/^models\//, ''))

export const getGeminiModel = (): string | null => {
  const value = safeGet(LS_GEMINI_MODEL)
  if (!value) return null
  const cleaned = value.trim().replace(/^models\//, '')
  return isGeminiModelName(cleaned) ? cleaned : null
}

export const setGeminiModel = (value: string): boolean => {
  const cleaned = value.trim().replace(/^models\//, '')
  if (!isGeminiModelName(cleaned)) return false
  return safeSet(LS_GEMINI_MODEL, cleaned)
}

export const clearGeminiModel = (): void => safeRemove(LS_GEMINI_MODEL)

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export interface SupabaseSyncMeta {
  lastSyncAt: string | null
  lastDirection: 'push' | 'pull' | null
}

const DEFAULT_SUPABASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env
    ? String(import.meta.env.VITE_SUPABASE_URL || '').trim()
    : ''
const DEFAULT_SUPABASE_ANON_KEY =
  typeof import.meta !== 'undefined' && import.meta.env
    ? String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
    : ''

/** Accept https URLs and http://localhost for local development. */
export const normalizeSupabaseUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const raw = value.trim().replace(/\/+$/, '')
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) return null
    if (parsed.pathname && parsed.pathname !== '/') return null
    if (parsed.search || parsed.hash) return null
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    )
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Service-role and secret keys must never reach a browser bundle or storage. */
export const looksLikeServiceRoleKey = (value: unknown): boolean => {
  if (typeof value !== 'string') return false
  const key = value.trim()
  if (/^sb_secret_/i.test(key) || /service[_ -]?role/i.test(key)) return true
  const payload = decodeJwtPayload(key)
  const role = payload && typeof payload.role === 'string' ? payload.role : ''
  return role === 'service_role' || role === 'supabase_admin'
}

export const isSupabaseAnonKey = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const key = value.trim()
  if (key.length < 20 || key.length > 4096 || /\s/.test(key)) return false
  return !looksLikeServiceRoleKey(key)
}

export const getEnvSupabaseConfig = (): SupabaseConfig | null => {
  const url = normalizeSupabaseUrl(DEFAULT_SUPABASE_URL)
  if (!url || !isSupabaseAnonKey(DEFAULT_SUPABASE_ANON_KEY)) return null
  return { url, anonKey: DEFAULT_SUPABASE_ANON_KEY }
}

export const getSupabaseConfig = (): SupabaseConfig | null => {
  const raw = safeGet(LS_SUPABASE_CONFIG)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<SupabaseConfig>
      const url = normalizeSupabaseUrl(parsed.url)
      if (url && isSupabaseAnonKey(parsed.anonKey)) return { url, anonKey: parsed.anonKey.trim() }
    } catch {
      // Fall through to environment defaults.
    }
  }
  return getEnvSupabaseConfig()
}

export const saveSupabaseConfig = (value: SupabaseConfig): boolean => {
  const url = normalizeSupabaseUrl(value.url)
  if (!url) return false
  if (!isSupabaseAnonKey(value.anonKey)) return false
  return safeSet(LS_SUPABASE_CONFIG, JSON.stringify({ url, anonKey: value.anonKey.trim() }))
}

export const clearSupabaseConfig = (): void => {
  safeRemove(LS_SUPABASE_CONFIG)
  safeRemove(LS_SUPABASE_LAST_SYNC)
}

export const getSupabaseAutoSync = (): boolean => safeGet(LS_SUPABASE_AUTO_SYNC) !== '0'

export const setSupabaseAutoSync = (value: boolean): void => {
  safeSet(LS_SUPABASE_AUTO_SYNC, value ? '1' : '0')
}

export const getSupabaseSyncMeta = (): SupabaseSyncMeta => {
  const raw = safeGet(LS_SUPABASE_LAST_SYNC)
  if (!raw) return { lastSyncAt: null, lastDirection: null }
  try {
    const parsed = JSON.parse(raw) as Partial<SupabaseSyncMeta>
    return {
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
      lastDirection: parsed.lastDirection === 'push' || parsed.lastDirection === 'pull' ? parsed.lastDirection : null,
    }
  } catch {
    return { lastSyncAt: null, lastDirection: null }
  }
}

export const setSupabaseSyncMeta = (meta: SupabaseSyncMeta): void => {
  safeSet(LS_SUPABASE_LAST_SYNC, JSON.stringify(meta))
}

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

export type MotionPreference = 'system' | 'reduced'
export type DensityPreference = 'comfortable' | 'compact'

export interface UiPreferences {
  motion: MotionPreference
  density: DensityPreference
  ambient: boolean
}

export const DEFAULT_PREFERENCES: UiPreferences = {
  motion: 'system',
  density: 'comfortable',
  ambient: true,
}

export const getUiPreferences = (): UiPreferences => {
  const raw = safeGet(LS_PREFERENCES)
  if (!raw) return DEFAULT_PREFERENCES
  try {
    const parsed = JSON.parse(raw) as Partial<UiPreferences>
    return {
      motion: parsed.motion === 'reduced' ? 'reduced' : 'system',
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      ambient: parsed.ambient !== false,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export const setUiPreferences = (preferences: UiPreferences): void => {
  safeSet(LS_PREFERENCES, JSON.stringify(preferences))
  applyUiPreferences(preferences)
}

/** Reflect preferences on <html> so CSS and assistive tech can react. */
export const applyUiPreferences = (preferences: UiPreferences): void => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.motion = preferences.motion === 'reduced' ? 'reduced' : 'system'
  root.dataset.density = preferences.density
  root.dataset.ambient = preferences.ambient ? 'on' : 'off'
}
