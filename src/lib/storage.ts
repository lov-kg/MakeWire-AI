import type {
  ComponentDefinition,
  GeneratedCode,
  Project,
  ProjectComponent,
  WorkspaceData,
} from '../types'
import { uid } from './utils'

const DB_NAME = 'makerwire-ai'
const DB_VERSION = 1
const STORE = 'workspace'
const RECORD_KEY = 'current'
const LS_KEY = 'makerwire:workspace:v1'

const isAvailable = () => typeof window !== 'undefined'

let dbPromise: Promise<IDBDatabase | null> | null = null

const openDatabase = (): Promise<IDBDatabase | null> => {
  if (!isAvailable() || !('indexedDB' in window)) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return dbPromise
}

const readIndexedDb = async (): Promise<WorkspaceData | null> => {
  const db = await openDatabase()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(RECORD_KEY)
      request.onsuccess = () => resolve(isWorkspace(request.result) ? request.result : null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

const writeIndexedDb = async (data: WorkspaceData): Promise<void> => {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

const readLocalStorage = (): WorkspaceData | null => {
  if (!isAvailable()) return null
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isWorkspace(parsed) ? parsed : null
  } catch {
    return null
  }
}

const writeLocalStorage = (data: WorkspaceData) => {
  if (!isAvailable()) return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded or storage disabled — IndexedDB remains the primary store.
  }
}

export const isWorkspace = (value: unknown): value is WorkspaceData => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorkspaceData>
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.projects) &&
    candidate.projects.length > 0 &&
    typeof candidate.activeProjectId === 'string' &&
    Array.isArray(candidate.customComponents)
  )
}

export const createComponentInstance = (
  componentId: string,
  quantity = 1,
  powerOverride: ProjectComponent['powerOverride'] = 'auto',
): ProjectComponent => ({
  instanceId: uid('inst'),
  componentId,
  quantity: Math.max(1, Math.min(20, Math.round(quantity))),
  powerOverride,
})

export const createProject = (
  name: string,
  boardId: string | null,
  components: ProjectComponent[] = [],
): Project => {
  const now = new Date().toISOString()
  return {
    id: uid('proj'),
    name: name.trim() || 'Untitled bench project',
    boardId,
    components,
    prompt: 'Read the sensors every 10 seconds and print the results to Serial.',
    framework: 'auto',
    codeHistory: [],
    activeCodeId: null,
    createdAt: now,
    updatedAt: now,
  }
}

export const DEMO_PROMPT =
  'Read temperature and humidity every 10 seconds, show the readings on the OLED, and print them to the Serial monitor.'

export const createStarterWorkspace = (): WorkspaceData => {
  const demo = createProject('Desk climate monitor', 'esp32-s3-devkitc-n16r8', [
    createComponentInstance('dht22'),
    createComponentInstance('ssd1306-oled'),
  ])
  demo.prompt = DEMO_PROMPT
  return {
    version: 1,
    projects: [demo],
    activeProjectId: demo.id,
    customComponents: [],
  }
}

export const touchProject = (project: Project): Project => ({
  ...project,
  updatedAt: new Date().toISOString(),
})

const migrateProject = (project: Project): Project => ({
  ...project,
  components: Array.isArray(project.components) ? project.components : [],
  codeHistory: Array.isArray(project.codeHistory) ? project.codeHistory : [],
  activeCodeId: project.activeCodeId ?? null,
  framework: project.framework ?? 'auto',
  prompt: project.prompt ?? '',
})

export const normalizeWorkspace = (data: WorkspaceData): WorkspaceData => {
  const projects = data.projects.map(migrateProject)
  const activeProjectId = projects.some((project) => project.id === data.activeProjectId)
    ? data.activeProjectId
    : projects[0]?.id ?? ''
  return {
    version: 1,
    projects,
    activeProjectId,
    customComponents: Array.isArray(data.customComponents) ? data.customComponents : [],
  }
}

export async function loadWorkspace(): Promise<WorkspaceData | null> {
  const fromDb = await readIndexedDb()
  if (fromDb) return normalizeWorkspace(fromDb)
  const fromStorage = readLocalStorage()
  return fromStorage ? normalizeWorkspace(fromStorage) : null
}

export async function saveWorkspace(data: WorkspaceData): Promise<void> {
  // Write the tiny localStorage mirror synchronously so a crash during an
  // IndexedDB transaction still leaves something recoverable.
  writeLocalStorage(data)
  await writeIndexedDb(data)
}

export const addCodeToProject = (
  project: Project,
  generated: GeneratedCode,
): Project => ({
  ...touchProject(project),
  codeHistory: [generated, ...project.codeHistory].slice(0, 24),
  activeCodeId: generated.id,
})

export const upsertCustomComponent = (
  customComponents: ComponentDefinition[],
  component: ComponentDefinition,
): ComponentDefinition[] => {
  const index = customComponents.findIndex((item) => item.id === component.id)
  if (index === -1) return [...customComponents, component]
  const next = [...customComponents]
  next[index] = component
  return next
}

export const exportWorkspace = (data: WorkspaceData): string => JSON.stringify(data, null, 2)

export const importWorkspace = (raw: string): WorkspaceData | null => {
  try {
    const parsed = JSON.parse(raw) as WorkspaceData
    return isWorkspace(parsed) ? normalizeWorkspace(parsed) : null
  } catch {
    return null
  }
}
