import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Plus, X } from 'lucide-react'
import type { ComponentDefinition, GeneratedCode, Project, Stage, TargetFramework, WorkspaceData } from './types'
import { allBoards, catalogCounts, getBoard, loadCatalog } from './catalog/registry'
import { generateWiring } from './lib/wiring'
import { getApiHealth, type ApiHealth } from './lib/ai'
import {
  applyUiPreferences,
  clearGeminiApiKey,
  getGeminiApiKey,
  getSupabaseAutoSync,
  getSupabaseConfig,
  getSupabaseSyncMeta,
  getUiPreferences,
  setGeminiApiKey,
  setSupabaseAutoSync,
  setSupabaseSyncMeta,
  setUiPreferences,
  type SupabaseConfig,
  type SupabaseSyncMeta,
  type UiPreferences,
} from './lib/settings'
import {
  fetchRemoteMeta,
  getCloudSession,
  pullWorkspaceFromCloud,
  pushWorkspaceToCloud,
  subscribeToAuth,
  workspaceUpdatedAt,
  type CloudSession,
} from './lib/supabase'
import {
  addCodeToProject,
  createComponentInstance,
  createProject,
  createStarterWorkspace,
  exportWorkspace,
  importWorkspace,
  loadWorkspace,
  saveWorkspace,
  touchProject,
  upsertCustomComponent,
} from './lib/storage'
import { downloadText } from './lib/utils'
import { useViewport } from './lib/responsive'
import { Header, type SaveState } from './components/Header'
import { SettingsModal, type SettingsTab } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { StageNav } from './components/StageNav'
import { BoardSelector } from './components/BoardSelector'
import { ComponentLibrary } from './components/ComponentLibrary'
import { WiringStudio } from './components/WiringStudio'
import { CodeStudio } from './components/CodeStudio'
import { Button, Modal, Skeleton } from './components/ui'
import { cn } from './lib/utils'

type ToastTone = 'success' | 'error' | 'info'

interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<Stage>('board')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [draftName, setDraftName] = useState('Untitled bench project')
  const [draftBoard, setDraftBoard] = useState<string>('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('ai')
  const [geminiApiKey, setGeminiApiKeyState] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<UiPreferences>(getUiPreferences)
  const [supabaseConfig, setSupabaseConfigState] = useState<SupabaseConfig | null>(getSupabaseConfig)
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null)
  const [syncMeta, setSyncMeta] = useState<SupabaseSyncMeta>(getSupabaseSyncMeta)
  const [autoSync, setAutoSync] = useState<boolean>(getSupabaseAutoSync)
  const lastAutoPush = useRef<string | null>(null)
  const autoSyncBlocked = useRef(false)

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: Date.now(), message, tone })
  }, [])

  useEffect(() => {
    applyUiPreferences(preferences)
  }, [preferences])

  useEffect(() => {
    let mounted = true
    const boot = async () => {
      try {
        await loadCatalog()
      } catch {
        if (mounted) notify('Some catalogue packs failed to load. Core boards and modules are still available.', 'error')
      }
      const stored = await loadWorkspace()
      if (!mounted) return
      setWorkspace(stored ?? createStarterWorkspace())
      setLoading(false)
    }

    void boot().catch(() => {
      if (!mounted) return
      setWorkspace(createStarterWorkspace())
      setLoading(false)
      notify('Local storage could not be read. A fresh demo workspace was created.', 'error')
    })

    try {
      setGeminiApiKeyState(getGeminiApiKey())
    } catch {
      // Key unavailable this session.
    }

    void getApiHealth().then((health) => {
      if (mounted) setApiHealth(health)
    })

    return () => {
      mounted = false
    }
  }, [notify])

  useEffect(() => {
    if (!workspace || loading) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      void saveWorkspace(workspace)
        .then(() => setSaveState('saved'))
        .catch(() => {
          setSaveState('error')
          notify('The workspace could not be saved. Export a backup now.', 'error')
        })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [workspace, loading, notify])

  /* Cloud session bootstrap: only runs when a Supabase project is saved. */
  useEffect(() => {
    if (!supabaseConfig) {
      setCloudSession(null)
      return
    }
    let active = true
    let unsubscribe: (() => void) | null = null
    void (async () => {
      try {
        const session = await getCloudSession()
        if (active) setCloudSession(session)
        const off = await subscribeToAuth((next) => {
          if (active) setCloudSession(next)
        })
        if (active) unsubscribe = off
        else off()
      } catch {
        if (active) setCloudSession(null)
      }
    })()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [supabaseConfig])

  /* Debounced auto-push. It pauses instead of overwriting a newer cloud copy. */
  useEffect(() => {
    if (!workspace || loading || !cloudSession || !supabaseConfig || !autoSync) return
    if (autoSyncBlocked.current) return
    const localUpdated = workspaceUpdatedAt(workspace)
    if (!localUpdated || localUpdated === lastAutoPush.current) return
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const remote = await fetchRemoteMeta()
          if (remote?.clientUpdatedAt && remote.clientUpdatedAt > localUpdated) {
            autoSyncBlocked.current = true
            notify(
              'The cloud copy is newer than this browser, so auto-sync paused. Open Settings → Cloud & Database to restore it or push deliberately.',
              'info',
            )
            return
          }
          await pushWorkspaceToCloud(workspace)
          lastAutoPush.current = localUpdated
          const meta: SupabaseSyncMeta = {
            lastSyncAt: new Date().toISOString(),
            lastDirection: 'push',
          }
          setSupabaseSyncMeta(meta)
          setSyncMeta(meta)
        } catch {
          // Auto-sync is best-effort; manual sync surfaces errors in Settings.
        }
      })()
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [workspace, loading, cloudSession, supabaseConfig, autoSync, notify])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const project = useMemo<Project | null>(() => {
    if (!workspace) return null
    return (
      workspace.projects.find((item) => item.id === workspace.activeProjectId) ??
      workspace.projects[0] ??
      null
    )
  }, [workspace])

  const viewport = useViewport()

  const board = project ? getBoard(project.boardId) : undefined
  const catalog = useMemo(() => catalogCounts(), [workspace])
  const boardOptions = useMemo(
    () => allBoards().slice().sort((a, b) => a.name.localeCompare(b.name)),
    [workspace],
  )

  const wiring = useMemo(
    () =>
      generateWiring(
        project?.boardId ?? null,
        project?.components ?? [],
        workspace?.customComponents ?? [],
      ),
    [project?.boardId, project?.components, workspace?.customComponents],
  )

  const updateActiveProject = useCallback(
    (updater: (project: Project) => Project) => {
      setWorkspace((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          projects: previous.projects.map((item) =>
            item.id === previous.activeProjectId ? touchProject(updater(item)) : item,
          ),
        }
      })
    },
    [],
  )

  const handleSelectBoard = (boardId: string) => {
    updateActiveProject((current) => ({ ...current, boardId }))
  }

  const handleAddComponent = (componentId: string) => {
    updateActiveProject((current) => ({
      ...current,
      components: [...current.components, createComponentInstance(componentId)],
    }))
  }

  const handleRemoveComponent = (instanceId: string) => {
    updateActiveProject((current) => ({
      ...current,
      components: current.components.filter((item) => item.instanceId !== instanceId),
    }))
  }

  const handleQuantity = (instanceId: string, quantity: number) => {
    updateActiveProject((current) => ({
      ...current,
      components: current.components.map((item) =>
        item.instanceId === instanceId
          ? { ...item, quantity: Math.max(1, Math.min(20, quantity)) }
          : item,
      ),
    }))
  }

  const handlePower = (instanceId: string, powerOverride: Project['components'][number]['powerOverride']) => {
    updateActiveProject((current) => ({
      ...current,
      components: current.components.map((item) =>
        item.instanceId === instanceId ? { ...item, powerOverride } : item,
      ),
    }))
  }

  const handleCustomComponent = (component: ComponentDefinition) => {
    if (!workspace) return
    const instance = createComponentInstance(component.id)
    setWorkspace((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        customComponents: upsertCustomComponent(previous.customComponents, component),
        projects: previous.projects.map((item) =>
          item.id === previous.activeProjectId
            ? touchProject({ ...item, components: [...item.components, instance] })
            : item,
        ),
      }
    })
  }

  const handleAddCode = (generated: GeneratedCode) => {
    updateActiveProject((current) => addCodeToProject(current, generated))
  }

  const handlePrompt = (prompt: string) => {
    updateActiveProject((current) => ({ ...current, prompt }))
  }

  const handleFramework = (framework: TargetFramework) => {
    updateActiveProject((current) => ({ ...current, framework }))
  }

  const handleSelectCode = (id: string) => {
    updateActiveProject((current) => ({ ...current, activeCodeId: id }))
  }

  const handleSelectProject = (id: string) => {
    setWorkspace((previous) => (previous ? { ...previous, activeProjectId: id } : previous))
    setStage('board')
  }

  const openNewProject = () => {
    setDraftName('Untitled bench project')
    setDraftBoard(board?.id ?? allBoards()[0]?.id ?? '')
    setNewProjectOpen(true)
  }

  const openSettings = (tab: SettingsTab = 'ai') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  const handleSaveGeminiKey = (key: string | null) => {
    setGeminiApiKeyState(key)
    if (key) {
      setGeminiApiKey(key)
      notify('Gemini API key saved — AI requests will use it from this browser.', 'success')
    } else {
      clearGeminiApiKey()
      notify('Gemini API key cleared.', 'info')
    }
  }

  const handlePreferencesChange = (next: UiPreferences) => {
    setPreferences(next)
    setUiPreferences(next)
  }

  const handleSupabaseConfigChange = (config: SupabaseConfig | null) => {
    setSupabaseConfigState(config)
    autoSyncBlocked.current = false
    lastAutoPush.current = null
    if (!config) setCloudSession(null)
  }

  const handleAutoSyncChange = (enabled: boolean) => {
    setAutoSync(enabled)
    setSupabaseAutoSync(enabled)
  }

  const handlePushWorkspace = async () => {
    if (!workspace) throw new Error('The workspace is still loading.')
    await pushWorkspaceToCloud(workspace)
    autoSyncBlocked.current = false
    lastAutoPush.current = workspaceUpdatedAt(workspace)
    notify('Workspace pushed to Supabase.', 'success')
  }

  const handlePullWorkspace = async () => {
    const remote = await pullWorkspaceFromCloud()
    if (!remote) {
      notify('No cloud copy exists yet. Push this workspace first.', 'info')
      return
    }
    const next = remote.workspace
    setWorkspace(next)
    setStage('board')
    autoSyncBlocked.current = false
    lastAutoPush.current = workspaceUpdatedAt(next)
    notify(
      `Workspace restored from Supabase (${next.projects.length} project${next.projects.length === 1 ? '' : 's'}).`,
      'success',
    )
  }

  const handleCreateProject = () => {
    const created = createProject(draftName, draftBoard || null)
    setWorkspace((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        projects: [created, ...previous.projects],
        activeProjectId: created.id,
      }
    })
    setNewProjectOpen(false)
    setStage('board')
    notify(`Project “${created.name}” created.`, 'success')
  }

  const handleRename = (name: string) => {
    updateActiveProject((current) => ({ ...current, name }))
  }

  const handleStage = (next: Stage) => {
    if (next !== 'board' && !board) {
      notify('Pick a board before moving down the pipeline.', 'info')
      setStage('board')
      return
    }
    setStage(next)
  }

  const handleExport = () => {
    if (!workspace) return
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(`makerwire-workspace-${stamp}.json`, exportWorkspace(workspace), 'application/json')
    notify('Workspace exported as JSON.', 'success')
  }

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const imported = importWorkspace(text)
      if (!imported) {
        notify('That file is not a valid MakerWire workspace export.', 'error')
        return
      }
      setWorkspace(imported)
      setStage('board')
      notify(`Imported ${imported.projects.length} project${imported.projects.length === 1 ? '' : 's'}.`, 'success')
    } catch {
      notify('The file could not be read.', 'error')
    }
  }

  const handleReset = () => {
    if (!window.confirm('Replace all projects in this browser with a fresh demo workspace? Export a backup first if you need it.')) {
      return
    }
    setWorkspace(createStarterWorkspace())
    setStage('board')
    notify('Demo workspace restored.', 'success')
  }

  if (loading || !workspace || !project) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-mint-400/25 bg-mint-400/10">
          <span className="absolute inset-0 animate-ping rounded-2xl border border-mint-400/20" />
          <span className="relative font-mono text-lg font-bold text-mint-300">MW</span>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-mint-400">loading bench</p>
          <p className="mt-2 text-sm text-slate-400">Loading the industrial catalogue and rehydrating projects…</p>
        </div>
        <div className="w-full max-w-sm space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mx-auto h-3 w-3/4" />
          <Skeleton className="mx-auto h-3 w-1/2" />
        </div>
      </div>
    )
  }

  const completed: Record<Stage, boolean> = {
    board: Boolean(project.boardId),
    components: project.components.length > 0,
    wiring: wiring.connections.length > 0 && wiring.status !== 'blocked',
    code: project.codeHistory.length > 0,
  }

  return (
    <div className="shell">
      <Header
        projects={workspace.projects}
        activeProjectId={workspace.activeProjectId}
        project={project}
        saveState={saveState}
        cloudSession={cloudSession}
        cloudConfigured={Boolean(supabaseConfig)}
        onSelectProject={handleSelectProject}
        onCreateProject={openNewProject}
        onSettings={openSettings}
      />

      <div className="content-wrap">
        <div className="mb-4 lg:hidden">
          <StageNav stage={stage} onStage={handleStage} completed={completed} variant="mobile" />
        </div>

        <div className="flex gap-6">
          <Sidebar
            stage={stage}
            onStage={handleStage}
            completed={completed}
            project={project}
            boardName={board?.shortName ?? null}
            boardChip={board?.chip ?? null}
            componentCount={project.components.length}
            wiringStatus={wiring.status}
            codeCount={project.codeHistory.length}
            apiHealth={apiHealth}
            workspace={workspace}
            cloudSession={cloudSession}
            cloudConfigured={Boolean(supabaseConfig)}
            onSettings={openSettings}
            onRenameProject={handleRename}
            onExport={handleExport}
            onImport={(file) => void handleImport(file)}
            onReset={handleReset}
          />

          <main id="main-content" className="min-w-0 flex-1">
            <div key={stage} className="animate-page-in">
              {!board || stage === 'board' ? (
                <BoardSelector selectedId={project.boardId} onSelect={handleSelectBoard} onContinue={() => setStage('components')} />
              ) : stage === 'components' ? (
                <ComponentLibrary
                  components={project.components}
                  customComponents={workspace.customComponents}
                  onAdd={handleAddComponent}
                  onRemove={handleRemoveComponent}
                  onQuantity={handleQuantity}
                  onPower={handlePower}
                  onCustomComponent={handleCustomComponent}
                  onContinue={() => setStage('wiring')}
                  onNotify={notify}
                  geminiApiKey={geminiApiKey}
                />
              ) : stage === 'wiring' ? (
                <WiringStudio
                  board={board}
                  project={project}
                  customComponents={workspace.customComponents}
                  wiring={wiring}
                  geminiApiKey={geminiApiKey}
                  onContinue={() => setStage('code')}
                  onGoComponents={() => setStage('components')}
                />
              ) : (
                <CodeStudio
                  board={board}
                  project={project}
                  customComponents={workspace.customComponents}
                  wiring={wiring}
                  geminiApiKey={geminiApiKey}
                  onPromptChange={handlePrompt}
                  onFrameworkChange={handleFramework}
                  onAddCode={handleAddCode}
                  onSelectCode={handleSelectCode}
                  onGoWiring={() => setStage('wiring')}
                  onGoComponents={() => setStage('components')}
                  onNotify={notify}
                />
              )}
            </div>

            <footer className="mt-10 flex flex-col gap-2 border-t border-white/[0.06] pt-5 text-[10px] leading-relaxed text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono uppercase tracking-wider">
                MakerWire AI · {viewport.deviceType} · {catalog.boards} boards · {catalog.components} modules ·{' '}
                {wiring.stats.connections} connections
              </p>
              <p>Verify every rail and pin against your hardware before applying power.</p>
            </footer>
          </main>
        </div>
      </div>

      <Modal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        title="Start a new project"
        description="Pick a name and a target board. You can change either later without losing the parts list."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewProjectOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateProject}>
              <Plus className="h-4 w-4" />
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="new-project-name" className="label">
              Project name
            </label>
            <input
              id="new-project-name"
              className="field"
              value={draftName}
              maxLength={64}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Bench prototype"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="new-project-board" className="label">
              Target board
            </label>
            <select
              id="new-project-board"
              className="field"
              value={draftBoard}
              onChange={(event) => setDraftBoard(event.target.value)}
            >
              <option value="">Choose later</option>
              {boardOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              The new project starts with an empty parts list. The current project stays saved in this browser.
            </p>
          </div>
        </div>
      </Modal>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
        apiKey={geminiApiKey}
        onKeyChange={handleSaveGeminiKey}
        onNotify={notify}
        apiHealth={apiHealth}
        supabaseConfig={supabaseConfig}
        onSupabaseConfigChange={handleSupabaseConfigChange}
        cloudSession={cloudSession}
        onCloudSessionChange={setCloudSession}
        syncMeta={syncMeta}
        onSyncMetaChange={setSyncMeta}
        autoSync={autoSync}
        onAutoSyncChange={handleAutoSyncChange}
        onPushWorkspace={handlePushWorkspace}
        onPullWorkspace={handlePullWorkspace}
        preferences={preferences}
        onPreferencesChange={handlePreferencesChange}
      />

      {toast ? (
        <div
          key={toast.id}
          className="fixed bottom-5 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0"
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              'relative animate-toast-in overflow-hidden rounded-xl border px-4 py-3 shadow-panel backdrop-blur',
              toast.tone === 'error'
                ? 'border-rose-400/30 bg-rose-950/85 text-rose-100'
                : toast.tone === 'success'
                  ? 'border-mint-400/30 bg-ink-850/95 text-mint-100'
                  : 'border-sky-400/25 bg-ink-850/95 text-sky-100',
            )}
          >
            <div className="flex items-start gap-3">
              {toast.tone === 'error' ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              ) : toast.tone === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-300" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
              )}
              <p className="min-w-0 flex-1 text-xs leading-relaxed">{toast.message}</p>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-slate-400 transition hover:text-white"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <span
              className={cn(
                'toast-timer absolute bottom-0 left-0 h-0.5 w-full',
                toast.tone === 'error' ? 'bg-rose-400/60' : toast.tone === 'success' ? 'bg-mint-400/60' : 'bg-sky-400/60',
              )}
              aria-hidden="true"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
