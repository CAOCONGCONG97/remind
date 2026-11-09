import type { EngineConfig, EngineListener, EnginePhase, EngineSnapshot } from './types'

/**
 * 与平台无关的休息引擎：
 * - fixed：按墙钟间隔；锁屏/睡眠跨过后若已逾期，唤醒立即休息
 * - cumulative：仅活跃会话累计；锁屏/睡眠暂停
 * 倒计时归零后进入 awaitContinue，须 continueWork / emergencySkip 才 dismiss。
 */
export class RestEngine {
  private config: EngineConfig
  private phase: EnginePhase = 'working'
  private sessionPaused = false
  /** 本段工作计时起点（墙钟 ms）；累计模式下暂停期间冻结 */
  private workSegmentStartedAt = 0
  /** 累计模式：本段已确认累计的毫秒（暂停前结算） */
  private cumulativeBankedMs = 0
  private restEndsAt = 0
  private lastNowMs = 0
  private readonly listeners = new Set<EngineListener>()

  constructor(config: EngineConfig, nowMs = Date.now()) {
    this.config = normalizeConfig(config)
    this.lastNowMs = nowMs
    this.workSegmentStartedAt = nowMs
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot(this.lastNowMs))
    return () => {
      this.listeners.delete(listener)
    }
  }

  snapshot(nowMs = this.lastNowMs): EngineSnapshot {
    return {
      phase: this.phase,
      workElapsedMs: this.computeWorkElapsedMs(nowMs),
      restRemainingMs: this.computeRestRemainingMs(nowMs),
      sessionPaused: this.sessionPaused,
      config: { ...this.config }
    }
  }

  updateConfig(config: EngineConfig, nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    this.config = normalizeConfig(config)
    // 进行中的休息不回溯缩短；工作段阈值立即按新配置判定
    if (this.phase === 'working' && !this.sessionPaused) {
      this.maybeTriggerRest(nowMs)
    }
    this.emit(nowMs)
  }

  tick(nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    if (this.phase === 'resting') {
      if (nowMs >= this.restEndsAt) {
        this.phase = 'awaitContinue'
        this.emit(nowMs)
      } else {
        this.emit(nowMs)
      }
      return
    }
    if (this.phase === 'awaitContinue') {
      this.emit(nowMs)
      return
    }
    if (this.phase === 'working' && !this.sessionPaused) {
      this.maybeTriggerRest(nowMs)
    }
    this.emit(nowMs)
  }

  /** 锁屏或进入睡眠/休眠 */
  pauseSession(nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    if (this.phase !== 'working' || this.sessionPaused) {
      this.emit(nowMs)
      return
    }
    if (this.config.triggerMode === 'cumulative') {
      this.cumulativeBankedMs += Math.max(0, nowMs - this.workSegmentStartedAt)
      this.workSegmentStartedAt = nowMs
    }
    this.sessionPaused = true
    this.emit(nowMs)
  }

  /**
   * 解锁 / 唤醒。
   * 固定间隔：若墙钟已越过本段到期点 → 立即休息。
   * 累计：恢复累计。
   */
  resumeSession(nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    if (this.phase !== 'working') {
      this.sessionPaused = false
      this.emit(nowMs)
      return
    }
    const wasPaused = this.sessionPaused
    this.sessionPaused = false
    if (this.config.triggerMode === 'fixed') {
      // 固定间隔用墙钟：暂停期间起点不变，唤醒后检查是否逾期
      if (wasPaused && this.computeWorkElapsedMs(nowMs) >= this.workLimitMs()) {
        this.enterRest(nowMs)
        return
      }
    } else {
      // 累计：暂停期间不计时，恢复后从新起点继续加 banked
      this.workSegmentStartedAt = nowMs
    }
    this.maybeTriggerRest(nowMs)
    this.emit(nowMs)
  }

  startRestNow(nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    if (this.phase === 'resting' || this.phase === 'awaitContinue') {
      this.emit(nowMs)
      return
    }
    this.sessionPaused = false
    this.enterRest(nowMs)
  }

  continueWork(nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    if (this.phase !== 'awaitContinue' && this.phase !== 'resting') {
      this.emit(nowMs)
      return
    }
    // 规格：继续工作是倒计时结束后的正常路径；倒计时期间应走紧急退出。
    // 仍允许在 resting 点继续（UI 仅在结束后展示按钮），防御性复位。
    this.resetWorkSegment(nowMs)
    this.emit(nowMs)
  }

  emergencySkip(nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    if (this.phase !== 'resting' && this.phase !== 'awaitContinue') {
      this.emit(nowMs)
      return
    }
    this.resetWorkSegment(nowMs)
    this.emit(nowMs)
  }

  private resetWorkSegment(nowMs: number): void {
    this.phase = 'working'
    this.sessionPaused = false
    this.cumulativeBankedMs = 0
    this.workSegmentStartedAt = nowMs
    this.restEndsAt = 0
  }

  private enterRest(nowMs: number): void {
    this.phase = 'resting'
    this.sessionPaused = false
    this.restEndsAt = nowMs + this.restLimitMs()
    this.emit(nowMs)
  }

  private maybeTriggerRest(nowMs: number): void {
    if (this.phase !== 'working' || this.sessionPaused) {
      return
    }
    if (this.computeWorkElapsedMs(nowMs) >= this.workLimitMs()) {
      this.enterRest(nowMs)
    }
  }

  private computeWorkElapsedMs(nowMs: number): number {
    if (this.phase !== 'working') {
      return 0
    }
    if (this.config.triggerMode === 'cumulative') {
      const active = this.sessionPaused ? 0 : Math.max(0, nowMs - this.workSegmentStartedAt)
      return this.cumulativeBankedMs + active
    }
    // fixed：墙钟自本段起点起算（含锁屏期间）
    return Math.max(0, nowMs - this.workSegmentStartedAt)
  }

  private computeRestRemainingMs(nowMs: number): number {
    if (this.phase === 'resting') {
      return Math.max(0, this.restEndsAt - nowMs)
    }
    if (this.phase === 'awaitContinue') {
      return 0
    }
    return 0
  }

  private workLimitMs(): number {
    return this.config.workMinutes * 60_000
  }

  private restLimitMs(): number {
    return this.config.restMinutes * 60_000
  }

  private emit(nowMs: number): void {
    const snap = this.snapshot(nowMs)
    for (const listener of this.listeners) {
      listener(snap)
    }
  }
}

function normalizeConfig(config: EngineConfig): EngineConfig {
  return {
    triggerMode: config.triggerMode === 'cumulative' ? 'cumulative' : 'fixed',
    workMinutes: Math.max(1, Math.floor(config.workMinutes)),
    restMinutes: Math.max(1, Math.floor(config.restMinutes))
  }
}
