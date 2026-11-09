import type { AppSettings, CancelShutdownScope } from '../core/types'
import { localDateKey, updateSettings } from './settings-store'
import { shutdownNow } from './platform'
import { ShutdownToastController } from './shutdown-toast'
import type { OverlayManager } from './overlay-manager'

/**
 * 每日关机调度：到「提前提醒」时点弹出右下角窗；到点执行关机。
 * 取消范围：仅本次 / 当天。
 */
export class ShutdownScheduler {
  private timer: NodeJS.Timeout | null = null
  private warningShownForKey = ''
  private settings: AppSettings

  constructor(
    settings: AppSettings,
    private readonly toast: ShutdownToastController,
    private readonly overlays: OverlayManager
  ) {
    this.settings = settings
  }

  applySettings(settings: AppSettings): void {
    this.settings = settings
  }

  start(): void {
    this.stop()
    this.timer = setInterval(() => {
      void this.tick()
    }, 1000)
    void this.tick()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.toast.hide()
    this.overlays.setBelowShutdownToast(false)
  }

  cancel(scope: CancelShutdownScope): AppSettings {
    if (scope === 'today') {
      this.settings = updateSettings({
        shutdownCancelledDate: localDateKey(),
        shutdownSkipNext: false
      })
    } else {
      this.settings = updateSettings({
        shutdownSkipNext: true
      })
    }
    this.toast.hide()
    this.overlays.setBelowShutdownToast(false)
    this.warningShownForKey = ''
    return this.settings
  }

  private async tick(): Promise<void> {
    if (!this.settings.dailyShutdownEnabled) {
      this.toast.hide()
      this.overlays.setBelowShutdownToast(false)
      return
    }

    const now = new Date()
    const today = localDateKey(now)
    if (this.settings.shutdownCancelledDate === today) {
      this.toast.hide()
      this.overlays.setBelowShutdownToast(false)
      return
    }

    const target = nextShutdownDate(now, this.settings.shutdownTime)
    if (!target) {
      return
    }

    const remainingMs = target.getTime() - now.getTime()
    const warnMs = this.settings.shutdownWarnMinutes * 60_000
    const dayKey = `${today}@${this.settings.shutdownTime}`

    if (remainingMs <= 0) {
      if (this.settings.shutdownSkipNext) {
        this.settings = updateSettings({ shutdownSkipNext: false })
        this.toast.hide()
        this.overlays.setBelowShutdownToast(false)
        return
      }
      this.toast.hide()
      this.overlays.setBelowShutdownToast(false)
      await shutdownNow()
      return
    }

    if (remainingMs <= warnMs) {
      const label = formatTime(target)
      const payload = { shutdownAtLabel: label, remainingMs }
      if (this.warningShownForKey !== dayKey) {
        this.warningShownForKey = dayKey
        this.overlays.setBelowShutdownToast(true)
        this.toast.show(payload)
      } else {
        this.toast.update(payload)
      }
    } else {
      this.toast.hide()
      this.overlays.setBelowShutdownToast(false)
      this.warningShownForKey = ''
    }
  }
}

function nextShutdownDate(now: Date, hhmm: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  const target = new Date(now)
  target.setSeconds(0, 0)
  target.setHours(hour, minute, 0, 0)
  // 已过今日关机点：本调度只关心「今日这一次」；过点后等次日（由日期键重置）
  return target
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
