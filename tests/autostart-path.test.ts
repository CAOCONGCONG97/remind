import { describe, expect, it } from 'vitest'
import { isEphemeralTempPath, resolveAutoStartTarget } from '../src/core/autostart-path'

describe('resolveAutoStartTarget', () => {
  it('prefers PORTABLE_EXECUTABLE_FILE over temp execPath', () => {
    const resolved = resolveAutoStartTarget({
      portableExecutableFile: 'C:\\Users\\me\\Desktop\\remind-0.1.0-portable.exe',
      execPath: 'C:\\Users\\me\\AppData\\Local\\Temp\\abc123\\强制休息提醒.exe',
      packaged: true,
      appPath: 'C:\\Users\\me\\AppData\\Local\\Temp\\abc123\\resources\\app.asar'
    })
    expect(resolved.source).toBe('portable')
    expect(resolved.path).toContain('portable.exe')
    expect(resolved.args).toEqual([])
  })

  it('uses installed execPath when packaged without portable env', () => {
    const resolved = resolveAutoStartTarget({
      execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\强制休息提醒\\强制休息提醒.exe',
      packaged: true,
      appPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\强制休息提醒\\resources\\app.asar'
    })
    expect(resolved.source).toBe('packaged')
    expect(resolved.path).toBe('C:\\Users\\me\\AppData\\Local\\Programs\\强制休息提醒\\强制休息提醒.exe')
  })

  it('dev mode points electron with app path args', () => {
    const resolved = resolveAutoStartTarget({
      execPath: 'C:\\Users\\me\\dev\\remind\\node_modules\\electron\\dist\\electron.exe',
      packaged: false,
      appPath: 'C:\\Users\\me\\dev\\remind'
    })
    expect(resolved.source).toBe('dev')
    expect(resolved.args[0]).toBe('C:\\Users\\me\\dev\\remind')
  })
})

describe('isEphemeralTempPath', () => {
  it('detects temp extract dirs', () => {
    expect(
      isEphemeralTempPath('C:\\Users\\me\\AppData\\Local\\Temp\\3LrSZdIysZ1\\强制休息提醒.exe', [
        'C:\\Users\\me\\AppData\\Local\\Temp'
      ])
    ).toBe(true)
    expect(
      isEphemeralTempPath('C:\\Users\\me\\AppData\\Local\\Programs\\强制休息提醒\\强制休息提醒.exe', [
        'C:\\Users\\me\\AppData\\Local\\Temp'
      ])
    ).toBe(false)
  })
})
