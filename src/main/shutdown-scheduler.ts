import type { AppSettings, CancelShutdownScope } from '../core/types'
import { evaluateDailyShutdown } from '../core/shutdown-schedule'
import { localDateKey, updateSettings } from './settings-store'
import { shutdownNow } from './platform'
import { ShutdownToastController } from './shutdown-toast'
import type { OverlayManager } from './overlay-manager'

/**
 * 每日关机调度：到「提前提醒」时点弹出右下角窗；到点执行关机。
 * 取消范围：仅本次 / 当天；也可推迟 N 分钟。
 *
 * 开机/登录若已晚于今日设定关机时刻：跳过今日自动关机（等明日），
 * 绝不因「时间已过」而在启动瞬间静默关机。
 */
export class ShutdownScheduler {
  private timer: NodeJS.Timeout | null = null
  private warningShownForKey = ''
  /** 本进程已进入提前提醒窗口的档期 key；过点且未武装 → 视为 missed，不关机 */
  private armedSlotKey = ''
  /** 今日已判定为「启动过晚跳过」的 slot，避免每秒重复判定 */
  private missedSlotKey = ''
  private settings: AppSettings

  constructor(
    settings: AppSettings,
    private readonly toast: ShutdownToastController,
    private readonly overlays: OverlayManager
  ) {
    this.settings = settings
  }

  applySettings(settings: AppSettings): void {
    // 关机时刻或开关变更后，丢弃旧档期的武装/跳过标记，按新配置重新判定
    if (
      settings.shutdownTime !== this.settings.shutdownTime ||
      settings.dailyShutdownEnabled !== this.settings.dailyShutdownEnabled
    ) {
      this.armedSlotKey = ''
      this.missedSlotKey = ''
      this.warningShownForKey = ''
    }
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
    this.armedSlotKey = ''
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
    const decision = evaluateDailyShutdown({
      enabled: this.settings.dailyShutdownEnabled,
      nowMs: Date.now(),
      shutdownTime: this.settings.shutdownTime,
      warnMinutes: this.settings.shutdownWarnMinutes,
      cancelledDate: this.settings.shutdownCancelledDate,
      skipNext: this.settings.shutdownSkipNext,
      deferredUntil: this.settings.shutdownDeferredUntil,
      armedSlotKey: this.armedSlotKey
    })

    switch (decision.kind) {
      case 'noop':
        this.toast.hide()
        this.overlays.setBelowShutdownToast(false)
        return
      case 'hideWarn':
        this.toast.hide()
        this.overlays.setBelowShutdownToast(false)
        this.warningShownForKey = ''
        return
      case 'warn': {
        // 进入提前提醒窗口即武装：之后到点才允许真正关机
        if (!decision.deferred) {
          this.armedSlotKey = decision.slotKey
        }
        const payload = {
          shutdownAtLabel: decision.shutdownAtLabel,
          remainingMs: decision.remainingMs,
          deferred: decision.deferred
        }
        this.overlays.setBelowShutdownToast(true)
        if (this.warningShownForKey !== decision.slotKey) {
          this.warningShownForKey = decision.slotKey
          this.toast.show(payload)
        } else {
          this.toast.update(payload)
        }
        return
      }
      case 'consumeSkipNext': {
        this.settings = updateSettings({
          shutdownSkipNext: false,
          ...(decision.clearDeferred ? { shutdownDeferredUntil: 0 } : {})
        })
        this.toast.hide()
        this.overlays.setBelowShutdownToast(false)
        return
      }
      case 'missedSlot': {
        // 启动时今日关机时刻已过且从未武装：跳过今日，等明日同一时刻
        if (this.missedSlotKey !== decision.slotKey) {
          this.missedSlotKey = decision.slotKey
          console.info(
            `[shutdown] skip today's auto-shutdown (started after ${this.settings.shutdownTime}); next run tomorrow`
          )
        }
        this.toast.hide()
        this.overlays.setBelowShutdownToast(false)
        return
      }
      case 'shutdown': {
        if (decision.clearDeferred) {
          this.settings = updateSettings({ shutdownDeferredUntil: 0 })
        }
        this.toast.hide()
        this.overlays.setBelowShutdownToast(false)
        await shutdownNow(decision.reason)
        return
      }
      default: {
        const _exhaustive: never = decision
        void _exhaustive
      }
    }
  }
}
