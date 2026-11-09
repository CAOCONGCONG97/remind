import type { AppSettings, CancelShutdownScope } from '../core/types'
import { localDateKey, updateSettings } from './settings-store'
import { shutdownNow } from './platform'
import { ShutdownToastController } from './shutdown-toast'
import type { OverlayManager } from './overlay-manager'

/**
 * 每日关机调度：到「提前提醒」时点弹出右下角窗；到点执行关机。
 * 取消范围：仅本次 / 当天；也可推迟 N 分钟。
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
        shutdownSkipNext: false,
        shutdownDeferredUntil: 0
      })
    } else {
      this.settings = updateSettings({
        shutdownSkipNext: true,
        shutdownDeferredUntil: 0
      })
    }
    this.toast.hide()
    this.overlays.setBelowShutdownToast(false)
    this.warningShownForKey = ''
    return this.settings
  }

  /** 密码校验后由主进程调用：推迟 N 分钟再关机 */
  defer(minutes: number, nowMs = Date.now()): AppSettings {
    const until = nowMs + Math.max(1, minutes) * 60_000
    this.settings = updateSettings({
      shutdownDeferredUntil: until,
      shutdownSkipNext: false
    })
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
    const nowMs = now.getTime()
    const today = localDateKey(now)
    if (this.settings.shutdownCancelledDate === today) {
      this.toast.hide()
      this.overlays.setBelowShutdownToast(false)
      return
    }

    if (this.settings.shutdownDeferredUntil > nowMs) {
      const remainingMs = this.settings.shutdownDeferredUntil - nowMs
      const label = formatTime(new Date(this.settings.shutdownDeferredUntil))
      const payload = { shutdownAtLabel: label, remainingMs, deferred: true }
      this.overlays.setBelowShutdownToast(true)
      if (this.warningShownForKey !== `defer:${this.settings.shutdownDeferredUntil}`) {
        this.warningShownForKey = `defer:${this.settings.shutdownDeferredUntil}`
        this.toast.show(payload)
      } else {
        this.toast.update(payload)
      }
      return
    }

    if (this.settings.shutdownDeferredUntil > 0 && this.settings.shutdownDeferredUntil <= nowMs) {
      // 推迟到期：执行关机（除非又被取消）
      if (this.settings.shutdownSkipNext) {
        this.settings = updateSettings({ shutdownSkipNext: false, shutdownDeferredUntil: 0 })
        this.toast.hide()
        this.overlays.setBelowShutdownToast(false)
        return
      }
      this.settings = updateSettings({ shutdownDeferredUntil: 0 })
      this.toast.hide()
      this.overlays.setBelowShutdownToast(false)
      await shutdownNow('强制休息提醒：推迟后的关机时刻已到')
      return
    }

    const target = nextShutdownDate(now, this.settings.shutdownTime)
    if (!target) {
      return
    }

    const remainingMs = target.getTime() - nowMs
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
      const payload = { shutdownAtLabel: label, remainingMs, deferred: false }
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
  return target
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
