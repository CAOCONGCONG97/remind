import { RestEngine } from '../core/engine'
import type { AppSettings, EngineSnapshot } from '../core/types'
import { settingsToEngineConfig } from '../core/types'
import { bindSessionHooks } from './platform'
import { OverlayManager } from './overlay-manager'
import type { PreRestToastController } from './pre-rest-toast'

/**
 * 把 RestEngine 接到主进程时钟与会话事件，并驱动遮罩 / 休息前提醒。
 */
export class EngineHost {
  private engine: RestEngine
  private timer: NodeJS.Timeout | null = null
  private unbindSession: (() => void) | null = null
  private lastPhase: EngineSnapshot['phase'] | null = null
  private preRestDismissed = false
  private preRestVisible = false

  constructor(
    settings: AppSettings,
    private readonly overlays: OverlayManager,
    private readonly preRestToast: PreRestToastController,
    private readonly onSnapshot?: (snapshot: EngineSnapshot) => void
  ) {
    this.engine = new RestEngine(settingsToEngineConfig(settings))
  }

  start(): void {
    this.stopTimersOnly()
    this.unbindSession = bindSessionHooks({
      onLock: () => this.engine.pauseSession(),
      onUnlock: () => this.engine.resumeSession(),
      onSuspend: () => this.engine.pauseSession(),
      onResume: () => this.engine.resumeSession()
    })
    this.engine.subscribe((snapshot) => this.handleSnapshot(snapshot))
    this.timer = setInterval(() => this.engine.tick(), 250)
    this.engine.tick()
  }

  stop(): void {
    this.stopTimersOnly()
    this.overlays.hide()
    this.preRestToast.hide()
    this.preRestVisible = false
  }

  applySettings(settings: AppSettings): void {
    this.engine.updateConfig(settingsToEngineConfig(settings))
  }

  startRestNow(): void {
    this.engine.startRestNow()
  }

  continueWork(): void {
    this.engine.continueWork()
  }

  emergencySkip(): void {
    this.engine.emergencySkip()
  }

  extendWork(minutes: number): boolean {
    return this.engine.extendWork(minutes)
  }

  dismissPreRestToast(): void {
    this.preRestDismissed = true
    this.preRestToast.hide()
    this.preRestVisible = false
  }

  getSnapshot(): EngineSnapshot {
    return this.engine.snapshot()
  }

  private stopTimersOnly(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.unbindSession?.()
    this.unbindSession = null
  }

  private handleSnapshot(snapshot: EngineSnapshot): void {
    const phase = snapshot.phase
    if (phase === 'resting' || phase === 'awaitContinue') {
      this.preRestToast.hide()
      this.preRestVisible = false
      if (this.lastPhase !== 'resting' && this.lastPhase !== 'awaitContinue') {
        this.overlays.show(snapshot)
      } else {
        this.overlays.update(snapshot)
      }
    } else {
      if (this.lastPhase === 'resting' || this.lastPhase === 'awaitContinue') {
        this.overlays.hide()
        this.preRestDismissed = false
      }
      this.syncPreRestToast(snapshot)
    }

    this.lastPhase = phase
    this.onSnapshot?.(snapshot)
  }

  private syncPreRestToast(snapshot: EngineSnapshot): void {
    if (!snapshot.preRestWarning || this.preRestDismissed) {
      if (this.preRestVisible) {
        this.preRestToast.hide()
        this.preRestVisible = false
      }
      return
    }
    const payload = { remainingMs: snapshot.workRemainingMs }
    if (!this.preRestVisible) {
      this.preRestToast.show(payload)
      this.preRestVisible = true
    } else {
      this.preRestToast.update(payload)
    }
  }
}
