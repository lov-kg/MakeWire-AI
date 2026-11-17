/**
 * Generates the light-theme override layer.
 *
 * The app was originally dark-only and uses Tailwind colour utilities directly
 * in ~740 places. Rewriting every call site would be noisy and easy to drift.
 * Instead this script scans the source for the colour utilities it actually
 * uses and emits high-specificity overrides that only apply when
 * `<html data-theme="light">`. Component classes built with @apply in
 * styles.css are overridden by hand in the light block there.
 *
 * Run with `npm run theme:generate` (also part of dev/build).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const OUT = fileURLToPath(new URL('../src/light-theme.generated.css', import.meta.url))

const FAMILIES = 'slate|white|ink|black|mint|sky|rose|amber|violet|orange'
const UTILITY = new RegExp(
  `^(text|bg|border|ring|divide|placeholder|caret|accent|decoration)-(${FAMILIES})(?:-\\d+)?(?:/(?:\\d+|\\[[\\d.]+\\]))?$`,
)
const SHADOW = /^shadow-(glow|panel|lift)$/
const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 }
const PSEUDOS = new Set([
  'hover',
  'focus',
  'focus-visible',
  'active',
  'disabled',
  'first',
  'last',
  'odd',
  'even',
  'visited',
  'checked',
])

const INK_LIGHT = {
  950: '#ffffff',
  900: '#f8fafc',
  850: '#f1f5f9',
  800: '#e2e8f0',
  750: '#cbd5e1',
  700: '#94a3b8',
}
const INK_TEXT = {
  950: '#05080c',
  900: '#070c12',
  850: '#0a1118',
  800: '#0d151e',
  750: '#111c27',
  700: '#172431',
}
const SLATE_TEXT = {
  50: '#0f172a',
  100: '#0f172a',
  200: '#1e293b',
  300: '#334155',
  400: '#475569',
  500: '#5f6f83',
  600: '#5f6f83',
  700: '#475569',
  800: '#334155',
  900: '#1e293b',
  950: '#0f172a',
}
const SLATE_SURFACE = {
  50: '#ffffff',
  100: '#f8fafc',
  200: '#f1f5f9',
  300: '#e2e8f0',
  400: '#cbd5e1',
  500: '#94a3b8',
  600: '#cbd5e1',
  700: '#cbd5e1',
  800: '#e2e8f0',
  900: '#f1f5f9',
  950: '#f8fafc',
}
const ACCENT_TEXT = {
  mint: { 100: '#0b6b4f', 200: '#0b6b4f', 300: '#0b6b4f', 400: '#0b6b4f', 500: '#0b6b4f', 600: '#0b6b4f', 700: '#0b6b4f' },
  sky: { 100: '#075985', 200: '#0369a1', 300: '#0369a1', 400: '#0369a1', 500: '#0284c7', 600: '#0369a1', 700: '#075985', 800: '#0c4a6e', 900: '#082f49', 950: '#082f49' },
  rose: { 100: '#9f1239', 200: '#be123c', 300: '#be123c', 400: '#e11d48', 500: '#e11d48', 600: '#be123c', 700: '#9f1239', 800: '#881337', 900: '#881337', 950: '#4c0519' },
  amber: { 100: '#92400e', 200: '#a16207', 300: '#a16207', 400: '#b45309', 500: '#d97706', 600: '#b45309', 700: '#92400e', 800: '#78350f', 900: '#78350f', 950: '#451a03' },
  violet: { 100: '#5b21b6', 200: '#6d28d9', 300: '#6d28d9', 400: '#6d28d9', 500: '#7c3aed', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065' },
  orange: { 100: '#7c2d12', 200: '#9a3412', 300: '#c2410c', 400: '#c2410c', 500: '#ea580c', 600: '#c2410c', 700: '#9a3412', 800: '#7c2d12', 900: '#7c2d12', 950: '#431407' },
}
const ACCENT_SURFACE = {
  mint: { 300: '#13ac7b', 400: '#29cf98', 500: '#13ac7b', 600: '#0f8f68' },
  sky: { 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49' },
  rose: { 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#fb7185', 700: '#fda4af', 800: '#fecdd3', 900: '#ffe4e6', 950: '#fff1f2' },
  amber: { 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#fbbf24', 700: '#fcd34d', 800: '#fde68a', 900: '#fef3c7', 950: '#fffbeb' },
  violet: { 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#a78bfa', 700: '#c4b5fd', 800: '#ddd6fe', 900: '#ede9fe', 950: '#f5f3ff' },
  orange: { 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#fb923c', 700: '#fdba74', 800: '#fed7aa', 900: '#ffedd5', 950: '#fff7ed' },
}
const SHADOWS = {
  glow: '0 0 0 1px rgba(19, 172, 123, 0.18), 0 16px 40px -24px rgba(19, 172, 123, 0.45)',
  panel: '0 18px 42px -30px rgba(15, 23, 42, 0.28)',
  lift: '0 18px 38px -26px rgba(15, 23, 42, 0.24), 0 0 0 1px rgba(15, 23, 42, 0.05)',
}
const PROPERTY = {
  text: 'color',
  placeholder: 'color',
  bg: 'background-color',
  border: 'border-color',
  divide: 'border-color',
  ring: '--tw-ring-color',
  caret: 'caret-color',
  accent: 'accent-color',
  decoration: 'text-decoration-color',
}

const hexToRgb = (hex) => {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
}
const withAlpha = (hex, alpha) => {
  const rounded = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000
  if (rounded === 1) return hex
  return `rgba(${hexToRgb(hex).join(', ')}, ${rounded})`
}
const parseAlpha = (suffix) => {
  if (!suffix) return 1
  if (suffix.startsWith('[')) return Number(suffix.slice(1, -1))
  return Number(suffix) / 100
}
const shadeOf = (base) => {
  const match = base.match(/-(\d+)$/)
  return match ? Number(match[1]) : null
}
const familyOf = (base) => base.split('-')[1]

const colourFor = (kind, family, shade, alpha) => {
  if (family === 'white') {
    if (kind === 'bg') return withAlpha(alpha === 1 ? '#ffffff' : '#0f172a', alpha)
    return withAlpha('#0f172a', Math.min(1, alpha * (kind === 'text' ? 1 : 1.6)))
  }
  if (family === 'black') return withAlpha('#0f172a', kind === 'bg' ? alpha * 0.25 : alpha)
  if (family === 'ink') {
    const source = kind === 'text' ? INK_TEXT : INK_LIGHT
    const hex = source[shade] ?? (kind === 'text' ? '#0f172a' : '#ffffff')
    return withAlpha(hex, alpha)
  }
  if (family === 'slate') {
    const source = kind === 'text' ? SLATE_TEXT : SLATE_SURFACE
    return withAlpha(source[shade] ?? (kind === 'text' ? '#334155' : '#f8fafc'), alpha)
  }
  const source = kind === 'text' ? ACCENT_TEXT[family] : ACCENT_SURFACE[family]
  const hex = source?.[shade] ?? (kind === 'text' ? '#334155' : '#f8fafc')
  return withAlpha(hex, alpha)
}

const escapeClass = (value) => value.replace(/([^a-zA-Z0-9_-])/g, '\\$1')

const walk = (directory, target) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, target)
    else if (['.ts', '.tsx', '.css'].includes(extname(entry.name)) && path !== OUT) target.push(path)
  }
}

const files = []
walk(SRC, files)
const rules = new Set()
const unknownVariants = new Set()

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const candidates = content.match(/[^\s'"`{}<>;]+/g) ?? []
  for (const raw of candidates) {
    const token = raw.replace(/[),;]+$/, '')
    const pieces = token.split(':')
    const base = pieces.pop()
    if (!base) continue
    const variants = pieces
    let declaration = ''
    let shadow = false

    const shadowMatch = base.match(SHADOW)
    if (shadowMatch) {
      declaration = `box-shadow: ${SHADOWS[shadowMatch[1]]}`
      shadow = true
    } else {
      const match = base.match(UTILITY)
      if (!match) continue
      const kind = match[1]
      const family = match[2]
      const shadeText = base.match(/-(\d+)/)?.[1]
      const alphaSuffix = base.match(/\/(?:\d+|\[[\d.]+\])$/)?.[0]?.slice(1)
      const alpha = parseAlpha(alphaSuffix)
      const property = PROPERTY[kind]
      if (!property) continue
      declaration = `${property}: ${colourFor(kind, family, shadeText ? Number(shadeText) : null, alpha)}`
    }

    const breakpoints = []
    const pseudos = []
    let groupPrefix = ''
    let suffix = ''
    for (const variant of variants) {
      if (variant in BREAKPOINTS) breakpoints.push(BREAKPOINTS[variant])
      else if (PSEUDOS.has(variant)) pseudos.push(variant)
      else if (variant === 'group-hover') groupPrefix = '.group:hover '
      else if (variant === 'group-focus-within') groupPrefix = '.group:focus-within '
      else if (variant === 'placeholder') suffix = '::placeholder'
      else if (variant === 'before') suffix = '::before'
      else if (variant === 'after') suffix = '::after'
      else if (variant === 'dark') break
      else unknownVariants.add(variant)
    }

    const selector = `[data-theme='light'] ${groupPrefix}.${escapeClass(token)}${suffix}${pseudos
      .map((pseudo) => `:${pseudo}`)
      .join('')}`
    const rule = `  ${selector} { ${declaration}${shadow ? ' !important' : ''} }`
    const media = breakpoints.length
      ? `@media (min-width: ${Math.max(...breakpoints)}px) {\n${rule}\n}`
      : rule
    rules.add(media)
  }
}

const header = [
  '/* Generated by scripts/generate-light-theme.mjs — do not edit by hand. */',
  '/* Overrides only apply under [data-theme="light"]; dark mode is unchanged. */',
  '',
]
writeFileSync(OUT, [...header, ...[...rules].sort(), ''].join('\n'), 'utf8')
console.log(`light theme: ${rules.size} overrides from ${files.length} source files`)
if (unknownVariants.size) console.log(`skipped unknown variants: ${[...unknownVariants].join(', ')}`)
