import { app } from 'electron'

/**
 * 开机自启：优先 Electron loginItemSettings。
 * Win11 托盘常驻应用通常写入当前用户「登录时启动」项。
 */
export function setAutoStartEnabled(enabled: boolean): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    return
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: app.isPackaged ? [] : ['--autostart']
    })
  } catch (error) {
    console.warn('[autostart] setLoginItemSettings failed', error)
  }
}

export function isAutoStartEnabled(): boolean {
  try {
    return Boolean(app.getLoginItemSettings().openAtLogin)
  } catch {
    return false
  }
}
