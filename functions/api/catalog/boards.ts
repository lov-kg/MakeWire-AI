import { clampNumber, fail, json, options, type Env } from '../_shared'

interface BoardItem {
  id: string
  name: string
  shortName: string
  vendor: string
  chip: string
  family: string
  description: string
  formFactor?: string
  lifecycle?: string
  pack?: string
  industrial?: boolean
  tags?: string[]
  interfaces?: string[]
  connectivity?: string[]
  protocols?: string[]
  standards?: string[]
}

interface CatalogFile {
  version: number
  kind: string
  total: number
  packs: unknown[]
  items: BoardItem[]
}

const loadCatalog = async (context: { request: Request; env: Env }): Promise<CatalogFile | null> => {
  if (!context.env.ASSETS) return null
  try {
    const url = new URL('/catalog/boards.json', context.request.url)
    const response = await context.env.ASSETS.fetch(url.toString())
    if (!response.ok) return null
    return (await response.json()) as CatalogFile
  } catch {
    return null
  }
}

const searchText = (item: BoardItem): string =>
  [
    item.name,
    item.shortName,
    item.vendor,
    item.chip,
    item.family,
    item.description,
    item.formFactor ?? '',
    item.lifecycle ?? '',
    ...(item.tags ?? []),
    ...(item.interfaces ?? []),
    ...(item.connectivity ?? []),
    ...(item.protocols ?? []),
    ...(item.standards ?? []),
  ]
    .join(' ')
    .toLowerCase()

export const onRequestOptions = async (context: { env: Env }) => options(context.env)

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const catalog = await loadCatalog(context)
  if (!catalog) {
    return fail('Catalogue data is not available. Run the catalog export during the build.', 503, context.env)
  }

  const url = new URL(context.request.url)
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 120)
  const family = (url.searchParams.get('family') ?? '').trim().toLowerCase().slice(0, 80)
  const pack = (url.searchParams.get('pack') ?? '').trim().toLowerCase().slice(0, 40)
  const lifecycle = (url.searchParams.get('lifecycle') ?? '').trim().toLowerCase().slice(0, 20)
  const industrialOnly = url.searchParams.get('industrial') === '1'
  const limit = Math.round(clampNumber(url.searchParams.get('limit'), 1, 200, 50))
  const offset = Math.round(clampNumber(url.searchParams.get('offset'), 0, 100_000, 0))

  const filtered = catalog.items.filter((item) => {
    if (family && item.family.toLowerCase() !== family) return false
    if (pack && (item.pack ?? '').toLowerCase() !== pack) return false
    if (lifecycle && (item.lifecycle ?? '').toLowerCase() !== lifecycle) return false
    if (industrialOnly && !item.industrial) return false
    if (query && !searchText(item).includes(query)) return false
    return true
  })

  const page = filtered.slice(offset, offset + limit)

  return json(
    {
      ok: true,
      kind: 'boards',
      version: catalog.version,
      total: catalog.total,
      matched: filtered.length,
      limit,
      offset,
      count: page.length,
      packs: catalog.packs,
      items: page,
    },
    200,
    context.env,
  )
}
