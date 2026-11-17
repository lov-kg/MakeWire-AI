/**
 * Theme modes are deliberately small and side-effect free so the same rules can
 * be used by React, by the pre-paint script in index.html and by tests.
 */
export type ThemePreference = 'light' | 'dark' | 'system' | 'daynight'
export type ResolvedTheme = 'light' | 'dark'

export const DAY_START_HOUR = 7
export const DAY_END_HOUR = 19

const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system', 'daynight']

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference)

export const resolveTheme = (
  preference: ThemePreference,
  now: Date = new Date(),
  systemPrefersLight: boolean = prefersLight(),
): ResolvedTheme => {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark'
  const hour = now.getHours()
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? 'light' : 'dark'
}

const prefersLight = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

/** Apply the resolved theme to the document. Safe to call repeatedly. */
export const applyResolvedTheme = (theme: ResolvedTheme): void => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'light' ? '#f8fafc' : '#05080c'
}

/**
 * Subscribe to whatever can change a resolved theme. Returns a cleanup function
 * so switching modes never leaves an old listener behind.
 */
export const watchThemePreference = (
  preference: ThemePreference,
  apply: (theme: ResolvedTheme) => void,
): (() => void) => {
  if (typeof window === 'undefined') return () => {}

  if (preference === 'system') {
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => apply(resolveTheme('system', new Date(), query.matches))
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange)
    else query.addListener(onChange)
    return () => {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', onChange)
      else query.removeListener(onChange)
    }
  }

  if (preference === 'daynight') {
    const tick = () => apply(resolveTheme('daynight'))
    const timer = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }

  return () => {}
}
