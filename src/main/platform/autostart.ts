import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import { isEphemeralTempPath, resolveAutoStartTarget, type AutoStartTarget } from '../../core/autostart-path'

/** 稳定的 Run 值名，避免落到 electron.app.Electron */
export const AUTOSTART_RUN_VALUE = 'RemindForcedRest'
/** 历史错误键（便携 Temp / 默认 AUMID） */
const LEGACY_RUN_VALUES = ['electron.app.Electron', 'electron.app.remind', '强制休息提醒']

export type AutoStartResult = {
  ok: boolean
  enabled: boolean
  path?: string
  message?: string
}

function currentTarget(): AutoStartTarget {
  return resolveAutoStartTarget({
    portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE,
    execPath: process.execPath,
    packaged: app.isPackaged,
    appPath: app.getAppPath()
  })
}

function quoteForCommandLine(value: string): string {
  if (!/[ \t"]/g.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildCommand(target: AutoStartTarget): string {
  const parts = [quoteForCommandLine(target.path), ...target.args.map(quoteForCommandLine)]
  return parts.join(' ')
}

function regAddRunValue(command: string): void {
  execFileSync(
    'reg.exe',
    ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', AUTOSTART_RUN_VALUE, '/t', 'REG_SZ', '/d', command, '/f'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
}

function regDeleteRunValue(valueName: string): void {
  try {
    execFileSync(
      'reg.exe',
      ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', valueName, '/f'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch {
    // 键不存在时 reg delete 非 0，忽略
  }
}

function cleanupLegacyRunValues(): void {
  for (const valueName of LEGACY_RUN_VALUES) {
    regDeleteRunValue(valueName)
  }
}

/**
 * 开机自启：Electron loginItemSettings + 直接写 HKCU Run（双保险）。
 * Win11「设置 → 应用 → 启动」里对应项需保持开启；`enabled: true` 会写 StartupApproved。
 */
export function setAutoStartEnabled(enabled: boolean): AutoStartResult {
  if (process.platform !== 'win32') {
    return { ok: false, enabled: false, message: '仅 Windows 支持开机自启' }
  }

  try {
    const target = currentTarget()
    if (enabled) {
      if (!existsSync(target.path)) {
        return {
          ok: false,
          enabled: false,
          path: target.path,
          message: `自启目标不存在：${target.path}`
        }
      }
      const tempRoots = [process.env.TEMP || '', process.env.TMP || ''].filter(Boolean)
      // 便携版应已解析到外层 portable.exe；若仍是 Temp，拒绝写入
      if (isEphemeralTempPath(target.path, tempRoots)) {
        return {
          ok: false,
          enabled: false,
          path: target.path,
          message:
            '当前运行在临时目录（常见于便携版解压），无法可靠开机自启。请安装 remind-*-setup.exe 后再开启。'
        }
      }
    }

    const command = buildCommand(target)

    app.setLoginItemSettings({
      openAtLogin: enabled,
      enabled,
      path: target.path,
      args: target.args,
      name: AUTOSTART_RUN_VALUE
    })

    cleanupLegacyRunValues()
    if (enabled) {
      regAddRunValue(command)
    } else {
      regDeleteRunValue(AUTOSTART_RUN_VALUE)
    }

    const verified = isAutoStartEnabled()
    if (enabled && !verified) {
      return {
        ok: false,
        enabled: false,
        path: target.path,
        message:
          '写入启动项后读取仍为关闭。请到「Windows 设置 → 应用 → 启动」中允许「强制休息提醒 / RemindForcedRest」。'
      }
    }

    return { ok: true, enabled: verified, path: target.path }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[autostart] failed', message)
    return { ok: false, enabled: false, message }
  }
}

export function isAutoStartEnabled(): boolean {
  try {
    const target = currentTarget()
    const fromElectron = app.getLoginItemSettings({
      path: target.path,
      args: target.args
    })
    if (fromElectron.openAtLogin || fromElectron.executableWillLaunchAtLogin) {
      return true
    }
  } catch {
    // fall through
  }

  try {
    const output = execFileSync(
      'reg.exe',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', AUTOSTART_RUN_VALUE],
      { windowsHide: true, encoding: 'utf8' }
    )
    return /RemindForcedRest/i.test(output)
  } catch {
    return false
  }
}
