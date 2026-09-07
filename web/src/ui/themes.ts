// KOAN.design theme library on the shared var contract (bible ch. 01). Copied from koan-ansi/web (the sibling).
export type ThemeMap = Record<string, string>

export const THEME_VARS = [
  '--bg0', '--bg', '--bg2', '--panel', '--panel2', '--field', '--header',
  '--line', '--line2',
  '--txt-hi', '--txt', '--body', '--muted', '--dim',
  '--accent', '--accent-dim', '--accent-soft', '--on-accent',
  '--ok', '--warn', '--bad', '--focus',
] as const

export const PRESET_THEMES: Record<string, ThemeMap> = {
  // WORLD, dark (his 09-07: "the entire UI should be dark mode"): ink panels, white words, the sky accent, chunky.
  WORLD: {
    '--bg0': '#0b0b0d', '--bg': '#101114', '--bg2': '#16181c',
    '--panel': '#17191d', '--panel2': '#22252b', '--field': '#0f1013',
    '--header': '#0f1013',
    '--line': '#f4f4f0', '--line2': '#f4f4f0',
    '--txt-hi': '#f6f6f2', '--txt': '#e6e6e0', '--body': '#cfd3d6',
    '--muted': '#8a949c', '--dim': '#5c656c',
    '--accent': '#66BDE6', '--accent-dim': '#3f9fcf', '--accent-soft': '#1f3a46',
    '--on-accent': '#0f0f0f',
    '--ok': '#8cc48c', '--warn': '#f3c258', '--bad': '#e0655f', '--focus': '#66BDE6',
  },
}

export const DEFAULT_THEME = 'WORLD'
const KEY = 'shdw-world-theme'   // a new key: everyone starts on WORLD

export function currentTheme(): string {
  try { return localStorage.getItem(KEY) ?? DEFAULT_THEME } catch { return DEFAULT_THEME }
}

export function applyTheme(name: string): void {
  const map = PRESET_THEMES[name] ?? PRESET_THEMES[DEFAULT_THEME]
  const root = document.documentElement
  for (const v of THEME_VARS) {
    const val = map[v]
    if (val) root.style.setProperty(v, val)
    else root.style.removeProperty(v)
  }
  try { localStorage.setItem(KEY, name) } catch { /* private mode */ }
}

export function accentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00ff9f'
}
