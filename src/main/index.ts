import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { hashPassword, verifyPassword } from '../core/password'
import type { AppSettings, CancelShutdownScope } from '../core/types'
import { EngineHost } from './engine-host'
import { OverlayManager } from './overlay-manager'
import { setAutoStartEnabled } from './platform'
import { SettingsWindowController, SetupWindowController } from './settings-window'
import { ShutdownScheduler } from './shutdown-scheduler'
import { ShutdownToastController } from './shutdown-toast'
import { aboutMessage, createAppTray } from './tray'
import { hasPasswordConfigured, loadSettings, saveSettings, updateSettings } from './settings-store'

let engineHost: EngineHost | null = null
let shutdownScheduler: ShutdownScheduler | null = null
let overlays: OverlayManager | null = null
let settingsWindow: SettingsWindowController | null = null
let setupWindow: SetupWindowController | null = null
let shutdownToast: ShutdownToastController | null = null
let tray: Electron.Tray | null = null
let quitting = false

const preloadPath = join(__dirname, '../preload/index.js')

function toPublicSettings(settings: AppSettings) {
  const { passwordHash: _passwordHash, ...rest } = settings
  return {
    ...rest,
    hasPassword: Boolean(settings.passwordHash)
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => toPublicSettings(loadSettings()))

  ipcMain.handle(
    'settings:save',
    async (
      _event,
      patch: Partial<AppSettings> & { password?: string; passwordConfirm?: string }
    ) => {
      const current = loadSettings()
      const next: AppSettings = { ...current }

      if (patch.triggerMode === 'fixed' || patch.triggerMode === 'cumulative') {
        next.triggerMode = patch.triggerMode
      }
      if (typeof patch.workMinutes === 'number') {
        next.workMinutes = patch.workMinutes
      }
      if (typeof patch.restMinutes === 'number') {
        next.restMinutes = patch.restMinutes
      }
      if (typeof patch.autoStart === 'boolean') {
        next.autoStart = patch.autoStart
        setAutoStartEnabled(patch.autoStart)
      }
      if (typeof patch.dailyShutdownEnabled === 'boolean') {
        next.dailyShutdownEnabled = patch.dailyShutdownEnabled
      }
      if (typeof patch.shutdownTime === 'string') {
        next.shutdownTime = patch.shutdownTime
      }
      if (typeof patch.shutdownWarnMinutes === 'number') {
        next.shutdownWarnMinutes = patch.shutdownWarnMinutes
      }

      const password = patch.password?.trim() ?? ''
      const passwordConfirm = patch.passwordConfirm?.trim() ?? ''
      if (password || passwordConfirm) {
        if (!password) {
          throw new Error('新密码不能为空')
        }
        if (password !== passwordConfirm) {
          throw new Error('两次输入的密码不一致')
        }
        next.passwordHash = hashPassword(password)
      }

      const saved = saveSettings(next)
      engineHost?.applySettings(saved)
      shutdownScheduler?.applySettings(saved)
      return toPublicSettings(saved)
    }
  )

  ipcMain.handle('setup:password', (_event, payload: { password: string; passwordConfirm: string }) => {
    const password = payload.password?.trim() ?? ''
    const passwordConfirm = payload.passwordConfirm?.trim() ?? ''
    if (!password) {
      return { ok: false, message: '密码不能为空' }
    }
    if (password !== passwordConfirm) {
      return { ok: false, message: '两次输入的密码不一致' }
    }
    const saved = updateSettings({ passwordHash: hashPassword(password) })
    setAutoStartEnabled(saved.autoStart)
    setupWindow?.markComplete()
    startRuntime(saved)
    return { ok: true }
  })

  ipcMain.handle('rest:continue', () => {
    engineHost?.continueWork()
  })

  ipcMain.handle('rest:emergency', (_event, password: string) => {
    const settings = loadSettings()
    if (!verifyPassword(password ?? '', settings.passwordHash)) {
      return { ok: false, message: '密码错误' }
    }
    engineHost?.emergencySkip()
    return { ok: true }
  })

  ipcMain.handle(
    'shutdown:cancel',
    (_event, payload: { password: string; scope: CancelShutdownScope }) => {
      const settings = loadSettings()
      if (!verifyPassword(payload.password ?? '', settings.passwordHash)) {
        return { ok: false, message: '密码错误' }
      }
      const scope = payload.scope === 'today' ? 'today' : 'once'
      const saved = shutdownScheduler?.cancel(scope) ?? settings
      shutdownScheduler?.applySettings(saved)
      return { ok: true }
    }
  )

  ipcMain.handle('shutdown:dismiss-toast', () => {
    shutdownToast?.hide()
    // 仅收起提醒，不等于取消关机；遮罩层级恢复由下一 tick 决定
  })
}

function startRuntime(settings: AppSettings): void {
  if (!overlays) {
    overlays = new OverlayManager(preloadPath)
  }
  if (!shutdownToast) {
    shutdownToast = new ShutdownToastController(preloadPath)
  }
  if (!settingsWindow) {
    settingsWindow = new SettingsWindowController(preloadPath)
  }

  engineHost?.stop()
  engineHost = new EngineHost(settings, overlays)
  engineHost.start()

  shutdownScheduler?.stop()
  shutdownScheduler = new ShutdownScheduler(settings, shutdownToast, overlays)
  shutdownScheduler.start()

  if (!tray) {
    tray = createAppTray({
      openSettings: () => settingsWindow?.open(),
      startRestNow: () => engineHost?.startRestNow(),
      showAbout: () => {
        dialog.showMessageBox({
          type: 'info',
          title: '关于',
          message: aboutMessage(),
          detail:
            '限制说明：无法覆盖 UAC/安全桌面，部分独占全屏游戏也可能压过遮罩。紧急密码仅本地校验，防一时手痒，非防破解。'
        })
      },
      quit: () => {
        quitting = true
        app.quit()
      }
    })
  }

  setAutoStartEnabled(settings.autoStart)
}

async function bootstrap(): Promise<void> {
  // 单实例，避免多托盘抢遮罩
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    settingsWindow?.open()
  })

  await app.whenReady()
  registerIpc()

  // 隐藏 dock 类行为：Windows 无 dock；保持无主窗口
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  setupWindow = new SetupWindowController(preloadPath)
  const settings = loadSettings()

  if (!hasPasswordConfigured(settings)) {
    await setupWindow.openAndWait()
    return
  }

  startRuntime(settings)
}

app.on('window-all-closed', () => {
  // 托盘常驻：关设置窗不退出（勿调用 app.quit）
})

app.on('before-quit', () => {
  quitting = true
  engineHost?.stop()
  shutdownScheduler?.stop()
  overlays?.destroy()
  shutdownToast?.destroy()
  tray?.destroy()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    settingsWindow?.open()
  }
})

void bootstrap().catch((error) => {
  console.error(error)
  dialog.showErrorBox('启动失败', String(error))
  app.quit()
})

// 抑制未使用告警（quitting 供后续扩展）
void quitting
