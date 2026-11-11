#!/usr/bin/env node
/**
 * Export the TypeScript catalogue packs to JSON for the Cloudflare Functions.
 * esbuild is already a Vite dependency, so this avoids adding a runtime loader.
 */

import { build } from 'esbuild'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = resolve(root, '.catalog-build')
const outputDir = resolve(root, 'public/catalog')

const report = (label, catalog) => {
  console.log(`[catalog] ${label}: ${catalog.total} entries across ${catalog.packs.length} packs`)
  if (catalog.duplicates.length > 0) {
    for (const duplicate of catalog.duplicates) {
      console.warn(`[catalog] duplicate ${label} id "${duplicate.id}" in ${duplicate.skipped} (kept ${duplicate.kept})`)
    }
  }
}

const main = async () => {
  await rm(workDir, { recursive: true, force: true })
  await mkdir(workDir, { recursive: true })
  await mkdir(outputDir, { recursive: true })

  const result = await build({
    entryPoints: [resolve(root, 'scripts/catalog-source.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    logLevel: 'silent',
  })

  const bundlePath = resolve(workDir, 'catalog.mjs')
  await writeFile(bundlePath, result.outputFiles[0].text, 'utf8')

  const module = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`)
  report('boards', module.boardCatalog)
  report('components', module.componentCatalog)

  await writeFile(resolve(outputDir, 'boards.json'), `${JSON.stringify(module.boardCatalog, null, 2)}\n`, 'utf8')
  await writeFile(
    resolve(outputDir, 'components.json'),
    `${JSON.stringify(module.componentCatalog, null, 2)}\n`,
    'utf8',
  )
  await rm(workDir, { recursive: true, force: true })
}

main().catch((error) => {
  console.error('[catalog] export failed:', error)
  process.exitCode = 1
})
