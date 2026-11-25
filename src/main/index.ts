import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { hashPassword, verifyPassword } from '../core/password'
import type { AppSettings, CancelShutdownScope } from '../core/types'
import { EngineHost } from './engine-host'
import { OnboardingWindowController } from './onboarding-window'
import { OverlayManager } from './overlay-manager'
import { isAutoStartEnabled, setAutoStartEnabled } from './platform'
import { PreRestToastController } from './pre-rest-toast'
import { SettingsWindowController, SetupWindowController } from './settings-window'
import { ShutdownScheduler } from './shutdown-scheduler'
import { ShutdownToastController } from './shutdown-toast'
import { aboutMessage, AppTrayController } from './tray'
import { hasPasswordConfigured, loadSettings, saveSettings, updateSettings } from './settings-store'

let engineHost: EngineHost | null = null
let shutdownScheduler: ShutdownScheduler | null = null
let overlays: OverlayManager | null = null
let settingsWindow: SettingsWindowController | null = null
let setupWindow: SetupWindowController | null = null
let onboardingWindow: OnboardingWindowController | null = null
let shutdownToast: ShutdownToastController | null = null
let preRestToast: PreRestToastController | null = null
let tray: AppTrayController | null = null
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
  ipcMain.handle('settings:get', () => {
    const settings = loadSettings()
    // 以系统 Run / loginItem 为准回显开关，避免 JSON 与注册表脱节
    const liveAutoStart = isAutoStartEnabled()
    if (settings.autoStart !== liveAutoStart) {
      updateSettings({ autoStart: liveAutoStart })
      settings.autoStart = liveAutoStart
    }
    return toPublicSettings(settings)
  })

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
      if (typeof patch.preRestWarnMinutes === 'number') {
        next.preRestWarnMinutes = patch.preRestWarnMinutes
      }
      if (typeof patch.autoStart === 'boolean') {
        const autoStartResult = setAutoStartEnabled(patch.autoStart)
        if (patch.autoStart && !autoStartResult.ok) {
          throw new Error(autoStartResult.message || '开机自启设置失败')
        }
        // 若系统层未真正打开，不要把 JSON 里的开关标成已开
        next.autoStart = patch.autoStart ? autoStartResult.enabled : false
        if (patch.autoStart && !autoStartResult.enabled) {
          throw new Error(
            autoStartResult.message ||
              '开机自启未生效，请到「Windows 设置 → 应用 → 启动」中允许本应用'
          )
        }
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
    if (saved.autoStart) {
      const autoStartResult = setAutoStartEnabled(true)
      if (!autoStartResult.ok || !autoStartResult.enabled) {
        updateSettings({ autoStart: false })
      }
    }
    setupWindow?.markComplete()
    // 首次设密后走三步引导；完成后由 onboarding:complete 启动计时
    onboardingWindow = new OnboardingWindowController(preloadPath)
    void onboardingWindow.openAndWait()
    return { ok: true }
  })

  ipcMain.handle('onboarding:complete', (_event, patch?: Partial<AppSettings>) => {
    const current = loadSettings()
    const next: AppSettings = { ...current }
    if (patch?.triggerMode === 'fixed' || patch?.triggerMode === 'cumulative') {
      next.triggerMode = patch.triggerMode
    }
    if (typeof patch?.workMinutes === 'number') {
      next.workMinutes = patch.workMinutes
    }
    if (typeof patch?.restMinutes === 'number') {
      next.restMinutes = patch.restMinutes
    }
    if (typeof patch?.dailyShutdownEnabled === 'boolean') {
      next.dailyShutdownEnabled = patch.dailyShutdownEnabled
    }
    const saved = saveSettings(next)
    onboardingWindow?.markComplete()
    startRuntime(saved)
    return toPublicSettings(saved)
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

  ipcMain.handle('rest:extend', (_event, payload: { minutes: number; password?: string }) => {
    const minutes = Number(payload.minutes)
    if (![15, 30].includes(minutes)) {
      return { ok: false, message: '仅支持延长 15 或 30 分钟' }
    }
    // 休息前提醒窗延长需密码；托盘延长不走此接口
    const settings = loadSettings()
    if (!verifyPassword(payload.password ?? '', settings.passwordHash)) {
      return { ok: false, message: '密码错误' }
    }
    const ok = engineHost?.extendWork(minutes) ?? false
    if (ok) {
      engineHost?.dismissPreRestToast()
    }
    return ok ? { ok: true } : { ok: false, message: '当前无法延长' }
  })

  ipcMain.handle('prerest:dismiss', () => {
    engineHost?.dismissPreRestToast()
  })

  ipcMain.handle('prerest:layout', (_event, layout: 'main' | 'extend') => {
    preRestToast?.setLayout(layout === 'extend' ? 'extend' : 'main')
  })

  ipcMain.handle('shutdown:layout', (_event, layout: 'main' | 'form') => {
    shutdownToast?.setLayout(layout === 'form' ? 'form' : 'main')
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

  ipcMain.handle('shutdown:defer', (_event, payload: { password: string; minutes: number }) => {
    const settings = loadSettings()
    if (!verifyPassword(payload.password ?? '', settings.passwordHash)) {
      return { ok: false, message: '密码错误' }
    }
    const minutes = Number(payload.minutes)
    if (![15, 30].includes(minutes)) {
      return { ok: false, message: '仅支持推迟 15 或 30 分钟' }
    }
    const saved = shutdownScheduler?.defer(minutes) ?? settings
    shutdownScheduler?.applySettings(saved)
    return { ok: true }
  })

  ipcMain.handle('shutdown:dismiss-toast', () => {
    shutdownToast?.hide()
  })
}

function confirmExtend(minutes: number): void {
  const result = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['取消', `延长 ${minutes} 分钟`],
    defaultId: 1,
    cancelId: 0,
    title: '本段再延长',
    message: `将当前工作段再延长 ${minutes} 分钟后再强制休息？`
  })
  if (result === 1) {
    const ok = engineHost?.extendWork(minutes)
    if (!ok) {
      dialog.showMessageBox({
        type: 'warning',
        title: '无法延长',
        message: '仅在工作计时阶段可以延长本段。'
      })
    }
  }
}

function startRuntime(settings: AppSettings): void {
  if (!overlays) {
    overlays = new OverlayManager(preloadPath)
  }
  if (!shutdownToast) {
    shutdownToast = new ShutdownToastController(preloadPath)
  }
  if (!preRestToast) {
    preRestToast = new PreRestToastController(preloadPath)
  }
  if (!settingsWindow) {
    settingsWindow = new SettingsWindowController(preloadPath)
  }

  engineHost?.stop()
  engineHost = new EngineHost(settings, overlays, preRestToast, (snapshot) => {
    const latest = loadSettings()
    tray?.updateStatus({
      snapshot,
      triggerMode: latest.triggerMode
    })
  })
  engineHost.start()

  shutdownScheduler?.stop()
  shutdownScheduler = new ShutdownScheduler(settings, shutdownToast, overlays)
  shutdownScheduler.start()

  if (!tray) {
    tray = new AppTrayController({
      openSettings: () => settingsWindow?.open(),
      startRestNow: () => engineHost?.startRestNow(),
      extendWork: (minutes) => confirmExtend(minutes),
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

  tray.updateStatus({
    snapshot: engineHost.getSnapshot(),
    triggerMode: settings.triggerMode
  })

  // 每次启动按当前设置重写 Run，顺带清掉历史错误的 Temp 自启项
  if (settings.autoStart) {
    const autoStartResult = setAutoStartEnabled(true)
    if (!autoStartResult.ok || !autoStartResult.enabled) {
      updateSettings({ autoStart: false })
      console.warn('[autostart] disabled after failed apply:', autoStartResult.message)
    }
  } else {
    setAutoStartEnabled(false)
  }
}

async function bootstrap(): Promise<void> {
  // 稳定 AUMID，避免 Run 键落到 electron.app.Electron
  app.setAppUserModelId('com.chaopin.remind')

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

  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  setupWindow = new SetupWindowController(preloadPath)
  const settings = loadSettings()

  if (!hasPasswordConfigured(settings)) {
    await setupWindow.openAndWait()
    // setup:password 内会开 onboarding 并 startRuntime
    return
  }

  startRuntime(settings)
}

app.on('window-all-closed', () => {
  // 托盘常驻
})

app.on('before-quit', () => {
  quitting = true
  engineHost?.stop()
  shutdownScheduler?.stop()
  overlays?.destroy()
  shutdownToast?.destroy()
  preRestToast?.destroy()
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

void quitting
