/*
 * Applied before CSS loads so a saved light or day/night theme never flashes
 * dark. Kept in a separate file because the CSP only allows 'self' scripts.
 */
;(function () {
  try {
    var raw = localStorage.getItem('makerwire:preferences:v1')
    var prefs = raw ? JSON.parse(raw) : {}
    var modes = ['light', 'dark', 'system', 'daynight']
    var mode = modes.indexOf(prefs.theme) >= 0 ? prefs.theme : 'dark'
    var hour = new Date().getHours()
    var systemLight =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches
    var theme =
      mode === 'light' ||
      (mode === 'system' && systemLight) ||
      (mode === 'daynight' && hour >= 7 && hour < 19)
        ? 'light'
        : 'dark'
    var root = document.documentElement
    root.dataset.theme = theme
    root.dataset.themeMode = mode
    root.classList.toggle('dark', theme === 'dark')
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.content = theme === 'light' ? '#f8fafc' : '#05080c'
  } catch (error) {
    /* Storage can be unavailable; the dark default still applies. */
  }
})()
