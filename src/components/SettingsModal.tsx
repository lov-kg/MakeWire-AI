import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Check,
  CheckCircle2,
  CircleSlash,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  Gauge,
  HardDrive,
  Info,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Palette,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { Badge, Button, IconButton, Accordion, Modal, Toggle } from './ui'
import {
  clearGeminiApiKey,
  clearGeminiModel,
  clearSupabaseConfig,
  getGeminiApiKey,
  getGeminiModel,
  getSupabaseConfig,
  isGeminiApiKey,
  looksLikeServiceRoleKey,
  maskSecret,
  maskSupabaseUrl,
  normalizeSupabaseUrl,
  saveSupabaseConfig,
  setGeminiApiKey,
  setGeminiModel,
  setSupabaseSyncMeta,
  setSupabaseAutoSync,
  type SupabaseConfig,
  type SupabaseSyncMeta,
  type UiPreferences,
} from '../lib/settings'
import {
  describeSupabaseError,
  signInWithEmail,
  signOutFromCloud,
  signUpWithEmail,
  testSupabaseConnection,
  type CloudConnectionState,
  type CloudSession,
  type CloudTestResult,
} from '../lib/supabase'
import {
  findGeminiModels,
  getGeminiStatus,
  testGeminiConnection,
  type GeminiConnectionState,
  type GeminiStatus,
} from '../lib/gemini'
import { getApiHealth, type ApiHealth } from '../lib/ai'
import { useViewport } from '../lib/responsive'
import { copyToClipboard, downloadText, formatDate } from '../lib/utils'
import { cn } from '../lib/utils'
import schemaSql from '../../supabase/schema.sql?raw'
export type SettingsTab = 'ai' | 'cloud' | 'appearance'

const TABS: Array<{ id: SettingsTab; label: string; short: string; hint: string; icon: typeof Bot }> = [
  { id: 'ai', label: 'AI & Integrations', short: 'AI', hint: 'Gemini & providers', icon: Sparkles },
  { id: 'cloud', label: 'Cloud & Database', short: 'Cloud', hint: 'Supabase sync', icon: Cloud },
  { id: 'appearance', label: 'Appearance', short: 'Display', hint: 'Motion & density', icon: Palette },
]

type Tone = 'mint' | 'rose' | 'amber' | 'slate' | 'sky'

const stateTone: Record<string, Tone> = {
  connected: 'mint',
  configured: 'sky',
  checking: 'sky',
  disconnected: 'slate',
  'invalid-key': 'rose',
  'rate-limited': 'amber',
  error: 'rose',
  'schema-missing': 'amber',
  'not-configured': 'slate',
}

const stateLabel: Record<string, string> = {
  connected: 'Connected',
  configured: 'Configured',
  checking: 'Checking…',
  disconnected: 'Disconnected',
  'invalid-key': 'Invalid key',
  'rate-limited': 'Rate limited',
  error: 'Error',
  'schema-missing': 'Schema missing',
  'not-configured': 'Not configured',
}

function StatusPill({ state, className }: { state: string; className?: string }) {
  const tone = stateTone[state] ?? 'slate'
  return (
    <Badge tone={tone} className={className}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'mint'
            ? 'bg-mint-400'
            : tone === 'rose'
              ? 'bg-rose-400'
              : tone === 'amber'
                ? 'bg-amber-400'
                : tone === 'sky'
                  ? 'animate-pulse-soft bg-sky-400'
                  : 'bg-slate-500',
        )}
      />
      {stateLabel[state] ?? state}
      {state === 'checking' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
    </Badge>
  )
}

function StatusPanel({
  state,
  message,
  tone,
  detail,
}: {
  state: string
  message: string
  tone?: Tone
  detail?: string
}) {
  const resolved = tone ?? stateTone[state] ?? 'slate'
  return (
    <div
      className={cn(
        'rounded-xl border px-3.5 py-3 text-xs leading-relaxed',
        resolved === 'mint'
          ? 'border-mint-400/25 bg-mint-400/[0.07] text-mint-100'
          : resolved === 'rose'
            ? 'border-rose-400/25 bg-rose-500/[0.08] text-rose-100'
            : resolved === 'amber'
              ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-100'
              : resolved === 'sky'
                ? 'border-sky-400/25 bg-sky-400/[0.07] text-sky-100'
                : 'border-white/10 bg-white/[0.03] text-slate-300',
      )}
      role="status"
      aria-live="polite"
    >
      <p className="flex items-start gap-2">
        {resolved === 'mint' ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : resolved === 'rose' ? (
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : resolved === 'amber' ? (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0">{message}</span>
      </p>
      {detail ? (
        <p className="mt-1.5 pl-5 font-mono text-[10px] uppercase tracking-wider text-current/60">{detail}</p>
      ) : null}
    </div>
  )
}

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  initialTab?: SettingsTab
  apiKey: string | null
  onKeyChange: (key: string | null) => void
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void
  apiHealth: ApiHealth | null
  supabaseConfig: SupabaseConfig | null
  onSupabaseConfigChange: (config: SupabaseConfig | null) => void
  cloudSession: CloudSession | null
  onCloudSessionChange: (session: CloudSession | null) => void
  syncMeta: SupabaseSyncMeta
  onSyncMetaChange: (meta: SupabaseSyncMeta) => void
  autoSync: boolean
  onAutoSyncChange: (enabled: boolean) => void
  onPushWorkspace: () => Promise<void>
  onPullWorkspace: () => Promise<void>
  preferences: UiPreferences
  onPreferencesChange: (preferences: UiPreferences) => void
}

export function SettingsModal({
  open,
  onClose,
  initialTab = 'ai',
  apiKey,
  onKeyChange,
  onNotify,
  apiHealth,
  supabaseConfig,
  onSupabaseConfigChange,
  cloudSession,
  onCloudSessionChange,
  syncMeta,
  onSyncMetaChange,
  autoSync,
  onAutoSyncChange,
  onPushWorkspace,
  onPullWorkspace,
  preferences,
  onPreferencesChange,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      description="AI providers, cloud sync and display preferences. Everything here is stored on this device unless you sign in."
      size="lg"
    >
      <div className="space-y-5">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-ink-950/60 p-1"
        >
          {TABS.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`settings-panel-${item.id}`}
                id={`settings-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition duration-200 ease-premium sm:flex-row sm:justify-center sm:gap-2 sm:text-left',
                  active ? 'bg-mint-400/10 text-mint-200' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold sm:hidden">{item.short}</span>
                  <span className="hidden truncate text-xs font-semibold sm:block">{item.label}</span>
                  <span className="hidden text-[10px] text-slate-500 sm:block">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div
          key={tab}
          id={`settings-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          className="animate-tab-in"
        >
          {tab === 'ai' ? (
            <AiTab
              apiKey={apiKey}
              onKeyChange={onKeyChange}
              onNotify={onNotify}
              apiHealth={apiHealth}
            />
          ) : tab === 'cloud' ? (
            <CloudTab
              supabaseConfig={supabaseConfig}
              onSupabaseConfigChange={onSupabaseConfigChange}
              cloudSession={cloudSession}
              onCloudSessionChange={onCloudSessionChange}
              syncMeta={syncMeta}
              onSyncMetaChange={onSyncMetaChange}
              autoSync={autoSync}
              onAutoSyncChange={onAutoSyncChange}
              onPushWorkspace={onPushWorkspace}
              onPullWorkspace={onPullWorkspace}
              onNotify={onNotify}
            />
          ) : (
            <AppearanceTab preferences={preferences} onChange={onPreferencesChange} />
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* AI & Integrations                                                   */
/* ------------------------------------------------------------------ */

function AiTab({
  apiKey,
  onKeyChange,
  onNotify,
  apiHealth,
}: {
  apiKey: string | null
  onKeyChange: (key: string | null) => void
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void
  apiHealth: ApiHealth | null
}) {
  const [value, setValue] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | 'models' | null>(null)
  const [status, setStatus] = useState<GeminiStatus | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState(() => getGeminiModel() ?? '')
  const [modelError, setModelError] = useState<string | null>(null)
  const [probe, setProbe] = useState<{
    state: GeminiConnectionState
    message: string
    model?: string
    latencyMs?: number
  } | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getGeminiStatus().then((next) => {
      if (active) setStatus(next)
    })
    return () => {
      active = false
    }
  }, [])

  const serverConfigured = Boolean(status?.serverConfigured || apiHealth?.ai.gemini)
  const storedKey = apiKey ?? getGeminiApiKey()
  const anyConfigured = Boolean(storedKey || serverConfigured)

  type AiState = GeminiConnectionState | 'configured'
  const connectionState: AiState = probe?.state ? probe.state : anyConfigured ? 'configured' : 'disconnected'

  const model = probe?.model || selectedModel || status?.model || apiHealth?.ai.geminiModel || undefined

  const findModels = async () => {
    const next = value.trim()
    if (next && !isGeminiApiKey(next)) {
      setFieldError('Enter a complete key before finding models.')
      return
    }
    setFieldError(null)
    setModelError(null)
    setBusy('models')
    try {
      const result = await findGeminiModels(next || null)
      if (result.error) {
        setModels([])
        setModelError(result.error)
        return
      }
      setModels(result.models)
      if (!result.models.length) {
        setModelError(
          "Google reports no text-generation models for this key. Confirm the Generative Language API is enabled for the key's project.",
        )
        return
      }
      const candidates = [selectedModel, getGeminiModel(), result.recommended]
      const nextModel =
        candidates.find(
          (candidate): candidate is string =>
            typeof candidate === 'string' && result.models.includes(candidate),
        ) ?? result.models[0]
      setSelectedModel(nextModel)
      setGeminiModel(nextModel)
      onNotify(
        `Found ${result.models.length} model${result.models.length === 1 ? '' : 's'}. Choose one, then test the connection.`,
        'success',
      )
    } finally {
      setBusy(null)
    }
  }

  const saveKey = async () => {
    const next = value.trim()
    if (!next) {
      onNotify(
        storedKey
          ? 'Paste a new key to replace the saved one, or use Remove key to delete it.'
          : 'Enter a Gemini API key first.',
        'info',
      )
      return
    }
    if (!isGeminiApiKey(next)) {
      setFieldError('That key looks incomplete. Copy the full key from Google AI Studio.')
      return
    }
    setFieldError(null)
    setBusy('save')
    setProbe(null)
    setModelError(null)
    try {
      const result = await testGeminiConnection(next, selectedModel || null)
      setProbe(result)
      if (result.state === 'invalid-key') {
        setFieldError(result.message)
        onNotify('Google rejected that key. Check it and try again.', 'error')
        return
      }
      if (!setGeminiApiKey(next)) {
        setFieldError('This browser blocked local storage, so the key could not be saved.')
        return
      }
      if (result.model) {
        setSelectedModel(result.model)
        setGeminiModel(result.model)
      }
      onKeyChange(next)
      setValue('')
      setStatus((previous) => ({ ...(previous ?? { model: result.model || '' }), configured: true, source: 'user', serverConfigured, model: result.model || previous?.model || '' }))
      onNotify(
        result.state === 'connected'
          ? 'Gemini key saved and verified.'
          : 'Gemini key saved. It could not be fully verified — test again later.',
        result.state === 'connected' ? 'success' : 'info',
      )
    } finally {
      setBusy(null)
    }
  }

  const testKey = async () => {
    const next = value.trim()
    if (next && !isGeminiApiKey(next)) {
      setFieldError('Enter a complete key before testing.')
      return
    }
    setFieldError(null)
    setBusy('test')
    try {
      const result = await testGeminiConnection(next || null, selectedModel || null)
      setProbe(result)
      if (result.state === 'invalid-key') {
        onNotify(result.message, 'error')
        return
      }
      if (result.model) {
        setSelectedModel(result.model)
        setGeminiModel(result.model)
      }
      if (next) {
        if (!setGeminiApiKey(next)) {
          setFieldError('This browser blocked local storage, so the key could not be saved.')
          return
        }
        onKeyChange(next)
        setValue('')
        setStatus((previous) => ({
          ...(previous ?? { model: result.model || '' }),
          configured: true,
          source: 'user',
          serverConfigured,
          model: result.model || previous?.model || '',
        }))
      }
      if (result.state === 'connected')
        onNotify(next ? 'Gemini connection verified. Key saved.' : 'Gemini connection verified.', 'success')
      else if (result.state === 'rate-limited')
        onNotify('The key was accepted, but Gemini is temporarily unavailable. Try again in a moment.', 'info')
      else onNotify(result.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const removeKey = async () => {
    setBusy('remove')
    try {
      clearGeminiApiKey()
      clearGeminiModel()
      onKeyChange(null)
      setValue('')
      setProbe(null)
      setModels([])
      setSelectedModel('')
      setModelError(null)
      setStatus((previous) => (previous ? { ...previous, configured: previous.serverConfigured, source: previous.serverConfigured ? 'server' : 'none' } : previous))
      onNotify('Gemini key removed from this browser.', 'info')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Google Gemini</p>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-white">AI enhancement provider</h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-400">
              Add your own key to unlock AI sketch synthesis, wiring reviews and component lookup. Keys are proxied
              through this deployment and never embedded in the app bundle.
            </p>
          </div>
          <StatusPill state={connectionState} />
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-ink-900/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="gemini-api-key" className="label mb-0 flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5 text-mint-300" />
              Personal API key
            </label>
            {storedKey ? (
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                stored · {maskSecret(storedKey)}
              </span>
            ) : serverConfigured ? (
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">server key in use</span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">optional</span>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <input
                id="gemini-api-key"
                type={showSecret ? 'text' : 'password'}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  setFieldError(null)
                }}
                placeholder={storedKey ? '••••••••••••••••  (saved — paste to replace)' : 'AIza…'}
                maxLength={400}
                className="field pr-11 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <IconButton
                label={showSecret ? 'Hide API key' : 'Show API key'}
                onClick={() => setShowSecret((current) => !current)}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 border-0 bg-transparent"
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </IconButton>
            </div>
            <Button variant="primary" onClick={() => void saveKey()} disabled={Boolean(busy)}>
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {value.trim() ? 'Save & verify' : storedKey ? 'Replace key' : 'Save key'}
            </Button>
          </div>

          {fieldError ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-200/90" role="alert">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {fieldError}
            </p>
          ) : null}

          <div className="mt-3 rounded-xl border border-white/[0.07] bg-ink-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-300">Model</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  {selectedModel
                    ? `Using ${selectedModel}. Find models to see everything this key can access.`
                    : 'Paste a key, then find the models it can use.'}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void findModels()} disabled={Boolean(busy)}>
                {busy === 'models' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Find models
              </Button>
            </div>

            {models.length ? (
              <>
                <label htmlFor="gemini-model" className="label mb-1 mt-3">
                  Choose a model
                </label>
                <select
                  id="gemini-model"
                  value={selectedModel}
                  onChange={(event) => {
                    const nextModel = event.target.value.trim()
                    setSelectedModel(nextModel)
                    setModelError(null)
                    if (nextModel) setGeminiModel(nextModel)
                  }}
                  className="field font-mono text-xs"
                >
                  {!selectedModel ? <option value="">Choose a model…</option> : null}
                  {selectedModel && !models.includes(selectedModel) ? (
                    <option value={selectedModel}>{selectedModel} (not listed)</option>
                  ) : null}
                  {models.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {models.length} model{models.length === 1 ? '' : 's'} available for this key. The choice is saved in
                  this browser and used by Test connection and AI requests.
                </p>
              </>
            ) : null}

            {modelError ? (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-200/90" role="alert">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {modelError}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void testKey()} disabled={Boolean(busy)}>
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Test connection
            </Button>
            {storedKey ? (
              <Button size="sm" variant="ghost" onClick={() => void removeKey()} disabled={Boolean(busy)}>
                {busy === 'remove' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleSlash className="h-3.5 w-3.5" />}
                Remove key
              </Button>
            ) : null}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:text-mint-200"
            >
              Get a key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {probe ? (
            <div className="mt-3">
              <StatusPanel
                state={probe.state}
                message={probe.message}
                detail={
                  probe.model
                    ? `gemini/${probe.model}${probe.latencyMs ? ` · ${probe.latencyMs} ms` : ''}`
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="mt-3">
              <StatusPanel
                state={connectionState}
                message={
                  connectionState === 'connected' && serverConfigured && !storedKey
                    ? `Using this deployment's server key for gemini/${model ?? 'gemini-2.5-flash'}.`
                    : anyConfigured
                      ? `A key is available${model ? ` for gemini/${model}` : ''}. Run a test to verify it end-to-end.`
                      : 'No Gemini key yet. The app still works: wiring, pin maps and local sketches do not need AI.'
                }              />
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <p className="eyebrow">Provider priority</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              title: 'Your key',
              detail: 'Sent per request from this browser. Highest priority.',
              state: storedKey ? 'active' : 'idle',
            },
            {
              title: 'Server Gemini key',
              detail: 'GEMINI_API_KEY secret on the Worker.',
              state: serverConfigured ? 'active' : 'idle',
            },
            {
              title: 'OpenAI',
              detail: 'Fallback when OPENAI_API_KEY is configured.',
              state: apiHealth?.ai.openai ? 'active' : 'idle',
            },
            {
              title: 'Workers AI',
              detail: 'Free binding fallback for this deployment.',
              state: apiHealth?.ai.workersAi ? 'active' : 'idle',
            },
          ].map((provider) => (
            <div
              key={provider.title}
              className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-ink-900/40 px-3.5 py-3"
            >
              <span
                className={cn(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  provider.state === 'active' ? 'bg-mint-400 shadow-[0_0_8px_1px_rgba(84,230,177,0.5)]' : 'bg-slate-600',
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200">{provider.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{provider.detail}</p>
              </div>
              <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-slate-600">
                {provider.state === 'active' ? 'ready' : 'off'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-ink-900/40 px-3.5 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint-400" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-200">Local-first by default.</span> The deterministic wiring engine
          and pin-aware code generator work offline. AI output is always shown as an enhancement, never as the source
          of truth for pin mapping.
        </p>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Cloud & Database                                                    */
/* ------------------------------------------------------------------ */

function CloudTab({
  supabaseConfig,
  onSupabaseConfigChange,
  cloudSession,
  onCloudSessionChange,
  syncMeta,
  onSyncMetaChange,
  autoSync,
  onAutoSyncChange,
  onPushWorkspace,
  onPullWorkspace,
  onNotify,
}: {
  supabaseConfig: SupabaseConfig | null
  onSupabaseConfigChange: (config: SupabaseConfig | null) => void
  cloudSession: CloudSession | null
  onCloudSessionChange: (session: CloudSession | null) => void
  syncMeta: SupabaseSyncMeta
  onSyncMetaChange: (meta: SupabaseSyncMeta) => void
  autoSync: boolean
  onAutoSyncChange: (enabled: boolean) => void
  onPushWorkspace: () => Promise<void>
  onPullWorkspace: () => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const envConfig = useMemo(() => getSupabaseConfig(), [])
  const [url, setUrl] = useState(supabaseConfig?.url ?? envConfig?.url ?? '')
  const [anonKey, setAnonKey] = useState(supabaseConfig?.anonKey ?? envConfig?.anonKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'push' | 'pull' | null>(null)
  const [test, setTest] = useState<CloudTestResult | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [authBusy, setAuthBusy] = useState<'sign-in' | 'sign-up' | 'sign-out' | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [schemaCopied, setSchemaCopied] = useState(false)

  useEffect(() => {
    if (!schemaCopied) return
    const timer = window.setTimeout(() => setSchemaCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [schemaCopied])

  useEffect(() => {
    setUrl(supabaseConfig?.url ?? envConfig?.url ?? '')
    setAnonKey(supabaseConfig?.anonKey ?? envConfig?.anonKey ?? '')
  }, [supabaseConfig, envConfig])

  const saved = Boolean(supabaseConfig)
  const sessionActive = Boolean(cloudSession)
  const schemaLineCount = useMemo(() => schemaSql.trim().split('\n').length, [])
  const connectionState: CloudConnectionState = busy === 'test'
    ? 'checking'
    : test?.state
      ? test.state
      : saved
        ? sessionActive
          ? 'connected'
          : 'configured'
        : 'disconnected'

  const handleSave = async () => {
    const normalized = normalizeSupabaseUrl(url)
    const key = anonKey.trim()
    if (!normalized) {
      setFieldError('Enter a valid project URL, for example https://abcdefgh.supabase.co.')
      return
    }
    if (!key) {
      setFieldError('Paste the anon / publishable key from Project Settings → API.')
      return
    }
    if (looksLikeServiceRoleKey(key)) {
      setFieldError('That is a service-role or secret key. Use the anon / publishable key instead — secret keys must never reach a browser.')
      return
    }
    setFieldError(null)
    setBusy('save')
    try {
      const result = await testSupabaseConnection({ url: normalized, anonKey: key }, cloudSession?.accessToken)
      setTest(result)
      if (result.state === 'invalid-key' || result.state === 'error') {
        setFieldError(result.message)
        onNotify('Supabase connection could not be verified.', 'error')
        return
      }
      if (!saveSupabaseConfig({ url: normalized, anonKey: key })) {
        setFieldError(
          looksLikeServiceRoleKey(key)
            ? 'Service-role and secret keys are rejected. Use the anon / publishable key.'
            : 'This browser blocked local storage. The configuration could not be saved.',
        )
        return
      }
      onSupabaseConfigChange({ url: normalized, anonKey: key })
      setUrl(normalized)
      onNotify(
        result.schemaReady
          ? 'Supabase connected and the sync table is ready.'
          : result.state === 'schema-missing'
            ? 'Supabase saved. Run supabase/schema.sql to create the sync table.'
            : result.state === 'connected'
              ? 'Supabase connected. Sign in to verify sync access.'
              : 'Supabase configuration saved.',
        result.schemaReady || result.state === 'connected' ? 'success' : 'info',
      )
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async () => {
    const normalized = normalizeSupabaseUrl(url)
    const key = anonKey.trim()
    if (!normalized || !key) {
      setFieldError('Add the project URL and anon key before testing.')
      return
    }
    if (looksLikeServiceRoleKey(key)) {
      setFieldError('That is a service-role or secret key. Use the anon / publishable key instead.')
      return
    }
    setFieldError(null)
    setBusy('test')
    try {
      const result = await testSupabaseConnection({ url: normalized, anonKey: key }, cloudSession?.accessToken)
      setTest(result)
      onNotify(result.message, result.ok ? 'success' : 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleRemove = async () => {
    setBusy('save')
    try {
      await signOutFromCloud()
    } finally {
      clearSupabaseConfig()
      onSupabaseConfigChange(null)
      onCloudSessionChange(null)
      setTest(null)
      setUrl('')
      setAnonKey('')
      setBusy(null)
      onNotify('Supabase configuration removed and session signed out.', 'info')
    }
  }

  const handleCopySchema = async () => {
    try {
      await copyToClipboard(schemaSql)
      setSchemaCopied(true)
      onNotify('Schema SQL copied. Paste it into the Supabase SQL editor and run it.', 'success')
    } catch {
      onNotify('Clipboard access was blocked. Use Download .sql instead.', 'error')
    }
  }

  const handleDownloadSchema = () => {
    downloadText('makerwire-supabase-schema.sql', schemaSql, 'application/sql')
    onNotify('makerwire-supabase-schema.sql downloaded.', 'success')
  }

  const handleAuth = async () => {
    if (!saved) {
      setAuthError('Save your Supabase project first.')
      return
    }
    if (!email.trim() || password.length < 6) {
      setAuthError('Enter an email and a password with at least 6 characters.')
      return
    }
    setAuthError(null)
    setAuthBusy(authMode)
    try {
      if (authMode === 'sign-in') {
        const { session, error } = await signInWithEmail(email, password)
        if (error) {
          setAuthError(error)
          return
        }
        onCloudSessionChange(session)
        setPassword('')
        onNotify('Signed in to Supabase.', 'success')
      } else {
        const { session, needsConfirmation, error } = await signUpWithEmail(email, password)
        if (error) {
          setAuthError(error)
          return
        }
        if (needsConfirmation) {
          onNotify('Check your email to confirm the account, then sign in.', 'info')
        } else {
          onCloudSessionChange(session)
          onNotify('Supabase account created and signed in.', 'success')
        }
        setPassword('')
      }
    } finally {
      setAuthBusy(null)
    }
  }

  const handleSignOut = async () => {
    setAuthBusy('sign-out')
    try {
      await signOutFromCloud()
      onCloudSessionChange(null)
      onNotify('Signed out of Supabase. Local projects stay on this device.', 'info')
    } finally {
      setAuthBusy(null)
    }
  }

  const handlePush = async () => {
    setBusy('push')
    try {
      await onPushWorkspace()
      const meta = { lastSyncAt: new Date().toISOString(), lastDirection: 'push' as const }
      setSupabaseSyncMeta(meta)
      onSyncMetaChange(meta)
    } catch (error) {
      onNotify(describeSupabaseError(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handlePull = async () => {
    setBusy('pull')
    try {
      await onPullWorkspace()
      const meta = { lastSyncAt: new Date().toISOString(), lastDirection: 'pull' as const }
      setSupabaseSyncMeta(meta)
      onSyncMetaChange(meta)
    } catch (error) {
      onNotify(describeSupabaseError(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Supabase</p>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-white">Optional cloud workspace</h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-400">
              Keep projects in sync across devices. MakerWire uses the public anon key with Row Level Security —
              never a service-role key.
            </p>
          </div>
          <StatusPill state={connectionState} />
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-ink-900/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="supabase-url" className="label">
                Project URL
              </label>
              <input
                id="supabase-url"
                className="field font-mono text-xs"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value)
                  setFieldError(null)
                }}
                placeholder="https://your-project.supabase.co"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
              />
            </div>
            <div>
              <label htmlFor="supabase-anon-key" className="label">
                Anon / publishable key
              </label>
              <div className="relative">
                <input
                  id="supabase-anon-key"
                  type={showKey ? 'text' : 'password'}
                  className="field pr-11 font-mono text-xs"
                  value={anonKey}
                  onChange={(event) => {
                    setAnonKey(event.target.value)
                    setFieldError(null)
                  }}
                  placeholder="eyJhbGciOi…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <IconButton
                  label={showKey ? 'Hide Supabase key' : 'Show Supabase key'}
                  onClick={() => setShowKey((current) => !current)}
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 border-0 bg-transparent"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </IconButton>
              </div>
            </div>
          </div>

          {fieldError ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-200/90" role="alert">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {fieldError}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={Boolean(busy)}>
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
              {saved ? 'Update & test' : 'Save & test'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleTest()} disabled={Boolean(busy)}>
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
              Test connection
            </Button>
            {saved ? (
              <Button variant="ghost" size="sm" onClick={handleRemove} disabled={Boolean(busy)}>
                <CircleSlash className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            ) : null}
          </div>

          {test ? (
            <div className="mt-3">
              <StatusPanel
                state={test.state}
                message={test.message}
                detail={test.latencyMs ? `${test.latencyMs} ms · ${test.schemaReady ? 'schema ready' : 'schema missing'}` : undefined}
              />
            </div>
          ) : saved ? (
            <div className="mt-3">
              <StatusPanel
                state={connectionState}
                message={
                  connectionState === 'connected'
                    ? 'Project saved and reachable. Sign in below to sync this workspace.'
                    : 'Project saved. Sign in to push and restore your workspace.'
                }
              />
            </div>
          ) : (
            <div className="mt-3">
              <StatusPanel
                state="disconnected"
                message="Cloud sync is optional. Without it, every project stays in this browser with local persistence."
              />
            </div>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-relaxed text-slate-600">
            <ShieldCheck className="h-3 w-3 shrink-0 text-mint-500" />
            Stored locally as {saved ? maskSupabaseUrl(url) : 'no configuration'}. Service-role keys are rejected.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Account</p>
          {cloudSession ? (
            <Badge tone="mint">
              <CheckCircle2 className="h-3 w-3" />
              {cloudSession.email ?? 'signed in'}
            </Badge>
          ) : (
            <Badge tone="slate">
              <WifiOff className="h-3 w-3" />
              signed out
            </Badge>
          )}
        </div>

        {cloudSession ? (
          <div className="space-y-3 rounded-xl border border-white/[0.08] bg-ink-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-200">{cloudSession.email ?? 'Supabase session'}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  user · {cloudSession.userId.slice(0, 8)}…
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void handleSignOut()} disabled={Boolean(authBusy)}>
                {authBusy === 'sign-out' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                Sign out
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="sm" variant="secondary" onClick={() => void handlePush()} disabled={Boolean(busy)}>
                {busy === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                Push workspace
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void handlePull()} disabled={Boolean(busy)}>
                {busy === 'pull' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                Restore from cloud
              </Button>
            </div>

            <Toggle
              checked={autoSync}
              onChange={(next) => {
                onAutoSyncChange(next)
                setSupabaseAutoSync(next)
                onNotify(next ? 'Auto-sync enabled.' : 'Auto-sync paused.', 'info')
              }}
              label="Auto-sync changes"
              description="Push a debounced snapshot after you edit a project while signed in."
            />

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-950/50 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {syncMeta.lastSyncAt
                  ? `Last ${syncMeta.lastDirection ?? 'sync'} · ${formatDate(syncMeta.lastSyncAt)}`
                  : 'No sync yet'}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">RLS enforced</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-white/[0.08] bg-ink-900/50 p-4">
            <div className="flex rounded-lg border border-white/10 bg-ink-950/60 p-1">
              {(['sign-in', 'sign-up'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setAuthMode(mode)
                    setAuthError(null)
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition',
                    authMode === mode ? 'bg-mint-400/10 text-mint-200' : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {mode === 'sign-in' ? <LogIn className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                  {mode === 'sign-in' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="supabase-email" className="label">
                  Email
                </label>
                <input
                  id="supabase-email"
                  type="email"
                  className="field"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setAuthError(null)
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={!saved}
                />
              </div>
              <div>
                <label htmlFor="supabase-password" className="label">
                  Password
                </label>
                <input
                  id="supabase-password"
                  type="password"
                  className="field"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setAuthError(null)
                  }}
                  placeholder="••••••••"
                  autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                  disabled={!saved}
                />
              </div>
            </div>

            {authError ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-200/90" role="alert">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {authError}
              </p>
            ) : null}

            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => void handleAuth()}
              disabled={!saved || Boolean(authBusy)}
            >
              {authBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : authMode === 'sign-in' ? <LogIn className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              {authMode === 'sign-in' ? 'Sign in to sync' : 'Create Supabase account'}
            </Button>
            <p className="text-[10px] leading-relaxed text-slate-600">
              Auth is optional and handled by Supabase. Disable email confirmation in Supabase if you want instant
              sign-in, or confirm via the email Supabase sends.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">Database setup</p>
          <Badge tone="amber">
            <ShieldAlert className="h-3 w-3" />
            required for sync
          </Badge>
        </div>

        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 text-[11px] leading-relaxed text-amber-100/90">
              <p className="font-semibold text-amber-100">Row Level Security is required</p>
              <p className="mt-1">
                Copy the schema below into your Supabase SQL editor and run it once. It creates the{' '}
                <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">makerwire_workspaces</code> table
                with policies scoped to <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">auth.uid()</code>.
                It is safe to re-run. Never use a service-role key in the browser.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void handleCopySchema()}>
              {schemaCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {schemaCopied ? 'Copied' : 'Copy schema SQL'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownloadSchema}>
              <Download className="h-3.5 w-3.5" />
              Download .sql
            </Button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-amber-100/60">
            {schemaLineCount} lines · includes table, RLS policies, and the updated_at trigger.
          </p>
        </div>

        <Accordion
          title="Preview schema.sql"
          description="Read-only copy of supabase/schema.sql"
          icon={<FileCode2 className="h-3.5 w-3.5" />}
          badge={<Badge tone="slate">SQL</Badge>}
        >
          <pre
            tabIndex={0}
            aria-label="Supabase schema SQL"
            className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-slate-300"
          >
            <code>{schemaSql.trim()}</code>
          </pre>
        </Accordion>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; hint?: string }>
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition duration-200 ease-premium',
              active
                ? 'border-mint-400/30 bg-mint-400/[0.08] text-white'
                : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:bg-white/[0.04]',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                active ? 'border-mint-400 bg-mint-400/20' : 'border-white/20',
              )}
            >
              {active ? <span className="h-1.5 w-1.5 rounded-full bg-mint-300" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold">{option.label}</span>
              {option.hint ? <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{option.hint}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function AppearanceTab({
  preferences,
  onChange,
}: {
  preferences: UiPreferences
  onChange: (preferences: UiPreferences) => void
}) {
  const viewport = useViewport()
  const deviceLabel =
    viewport.deviceType === 'mobile'
      ? 'Mobile'
      : viewport.deviceType === 'tablet'
        ? 'Tablet'
        : viewport.deviceType === 'laptop'
          ? 'Laptop'
          : 'Desktop'

  const update = (patch: Partial<UiPreferences>) => onChange({ ...preferences, ...patch })

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <p className="eyebrow">Motion</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Transitions are CSS-only and respect your operating system. Choose reduced motion to disable them here
            regardless of system settings.
          </p>
        </div>
        <Segmented
          label="Motion preference"
          value={preferences.motion}
          onChange={(motion) => update({ motion })}
          options={[
            { value: 'system', label: 'Follow system', hint: 'Animate unless prefers-reduced-motion is set.' },
            { value: 'reduced', label: 'Reduced motion', hint: 'Disable page, modal and section transitions.' },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <p className="eyebrow">Density</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Compact density tightens spacing so more of the workspace fits on screen. The layout stays fully
            responsive at every breakpoint.
          </p>
        </div>
        <Segmented
          label="Interface density"
          value={preferences.density}
          onChange={(density) => update({ density })}
          options={[
            { value: 'comfortable', label: 'Comfortable', hint: 'Spacious cards and generous section gaps.' },
            { value: 'compact', label: 'Compact', hint: 'Tighter padding for dense review sessions.' },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <p className="eyebrow">Atmosphere</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            The ambient background adds soft colour behind the workspace. Turning it off uses a flat dark surface
            for maximum contrast and battery savings.
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-ink-900/50 px-4 py-3">
          <Toggle
            checked={preferences.ambient}
            onChange={(ambient) => update({ ambient })}
            label="Ambient background"
            description={preferences.ambient ? 'Soft mint and sky gradients enabled.' : 'Flat, high-contrast background.'}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-white/[0.07] bg-ink-900/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Detected display</p>
          <Badge tone="sky">{deviceLabel}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          {[
            { label: 'Viewport', value: `${viewport.width}×${viewport.height}` },
            { label: 'Orientation', value: viewport.orientation },
            { label: 'Input', value: viewport.isTouch ? 'touch' : 'pointer' },
            { label: 'Breakpoint', value: viewport.deviceType },
          ].map((item) => (
            <div key={item.label} className="panel-inset px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-200">{item.value}</p>
            </div>
          ))}
        </div>
        <p className="flex items-start gap-1.5 pt-1 text-[10px] leading-relaxed text-slate-600">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Layouts reflow automatically on resize and orientation change; nothing is clipped or horizontally scrolled.
        </p>
      </section>

      <section className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-ink-900/40 px-3.5 py-3">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          Preferences are stored in this browser only, alongside your workspace. No display data is sent anywhere.
        </p>
      </section>
    </div>
  )
}
