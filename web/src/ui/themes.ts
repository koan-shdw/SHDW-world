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
  // WORLD (GAME.md §2): Messenger's palette pushed to DokeV's sun. Light, chunky, ink outlines. The game's default.
  WORLD: {
    '--bg0': '#F8F8F8', '--bg': '#EEF4F7', '--bg2': '#E2ECF2',
    '--panel': '#FFFFFF', '--panel2': '#F1F6F9', '--field': '#FFFFFF',
    '--header': '#F8F8F8',
    '--line': '#0f0f0f', '--line2': '#0f0f0f',
    '--txt-hi': '#0f0f0f', '--txt': '#1c2429', '--body': '#2c3a44',
    '--muted': '#647A87', '--dim': '#93A6B1',
    '--accent': '#66BDE6', '--accent-dim': '#3f9fcf', '--accent-soft': '#afe7eb',
    '--on-accent': '#0f0f0f',
    '--ok': '#8cc48c', '--warn': '#f3c258', '--bad': '#c25959', '--focus': '#66BDE6',
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
