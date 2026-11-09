import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_SETTINGS, type AppSettings } from '../core/types'

const FILE_NAME = 'settings.json'

function settingsPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function sanitize(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
  merged.triggerMode = merged.triggerMode === 'cumulative' ? 'cumulative' : 'fixed'
  merged.workMinutes = clampInt(merged.workMinutes, 1, 24 * 60, DEFAULT_SETTINGS.workMinutes)
  merged.restMinutes = clampInt(merged.restMinutes, 1, 180, DEFAULT_SETTINGS.restMinutes)
  merged.preRestWarnMinutes = clampInt(
    merged.preRestWarnMinutes,
    1,
    30,
    DEFAULT_SETTINGS.preRestWarnMinutes
  )
  merged.passwordHash = typeof merged.passwordHash === 'string' ? merged.passwordHash : ''
  merged.autoStart = Boolean(merged.autoStart)
  merged.dailyShutdownEnabled = Boolean(merged.dailyShutdownEnabled)
  merged.shutdownTime = normalizeTime(merged.shutdownTime) ?? DEFAULT_SETTINGS.shutdownTime
  merged.shutdownWarnMinutes = clampInt(merged.shutdownWarnMinutes, 1, 120, DEFAULT_SETTINGS.shutdownWarnMinutes)
  merged.shutdownCancelledDate = typeof merged.shutdownCancelledDate === 'string' ? merged.shutdownCancelledDate : ''
  merged.shutdownSkipNext = Boolean(merged.shutdownSkipNext)
  merged.shutdownDeferredUntil = clampInt(
    merged.shutdownDeferredUntil,
    0,
    Number.MAX_SAFE_INTEGER,
    0
  )
  return merged
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.floor(num)))
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function loadSettings(): AppSettings {
  const filePath = settingsPath()
  if (!existsSync(filePath)) {
    return sanitize(DEFAULT_SETTINGS)
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<AppSettings>
    return sanitize(parsed)
  } catch {
    return sanitize(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const next = sanitize(settings)
  const filePath = settingsPath()
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, ...patch })
}

export function hasPasswordConfigured(settings = loadSettings()): boolean {
  return Boolean(settings.passwordHash)
}

/** 本地日历日 YYYY-MM-DD */
export function localDateKey(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
