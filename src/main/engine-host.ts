import { RestEngine } from '../core/engine'
import type { AppSettings, EngineSnapshot } from '../core/types'
import { settingsToEngineConfig } from '../core/types'
import { bindSessionHooks } from './platform'
import { OverlayManager } from './overlay-manager'

/**
 * 把 RestEngine 接到主进程时钟与会话事件，并驱动遮罩。
 */
export class EngineHost {
  private engine: RestEngine
  private timer: NodeJS.Timeout | null = null
  private unbindSession: (() => void) | null = null
  private lastPhase: EngineSnapshot['phase'] | null = null

  constructor(
    settings: AppSettings,
    private readonly overlays: OverlayManager,
    private readonly onSnapshot?: (snapshot: EngineSnapshot) => void
  ) {
    this.engine = new RestEngine(settingsToEngineConfig(settings))
  }

  start(): void {
    this.stop()
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
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.unbindSession?.()
    this.unbindSession = null
    this.overlays.hide()
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

  getSnapshot(): EngineSnapshot {
    return this.engine.snapshot()
  }

  private handleSnapshot(snapshot: EngineSnapshot): void {
    const phase = snapshot.phase
    if (phase === 'resting' || phase === 'awaitContinue') {
      if (this.lastPhase !== 'resting' && this.lastPhase !== 'awaitContinue') {
        this.overlays.show(snapshot)
      } else {
        this.overlays.update(snapshot)
      }
    } else if (this.lastPhase === 'resting' || this.lastPhase === 'awaitContinue') {
      this.overlays.hide()
    }
    this.lastPhase = phase
    this.onSnapshot?.(snapshot)
  }
}
