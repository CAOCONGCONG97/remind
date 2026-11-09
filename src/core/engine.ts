import type { EngineConfig, EngineListener, EnginePhase, EngineSnapshot } from './types'

/**
 * 与平台无关的休息引擎：
 * - fixed：按墙钟间隔；锁屏/睡眠跨过后若已逾期，唤醒立即休息
 * - cumulative：仅活跃会话累计；锁屏/睡眠暂停
 * - 支持本段延长（workBonusMs）；休息前进入 preRestWarning 窗口
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
  /** 本段临时延长的毫秒（专注会话） */
  private workBonusMs = 0
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
    const workElapsedMs = this.computeWorkElapsedMs(nowMs)
    const workRemainingMs = this.computeWorkRemainingMs(nowMs, workElapsedMs)
    const warnMs = this.config.preRestWarnMinutes * 60_000
    const preRestWarning =
      this.phase === 'working' && !this.sessionPaused && workRemainingMs > 0 && workRemainingMs <= warnMs

    return {
      phase: this.phase,
      workElapsedMs,
      workRemainingMs,
      restRemainingMs: this.computeRestRemainingMs(nowMs),
      preRestWarning,
      workBonusMs: this.workBonusMs,
      sessionPaused: this.sessionPaused,
      config: { ...this.config }
    }
  }

  updateConfig(config: EngineConfig, nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    this.config = normalizeConfig(config)
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
      if (wasPaused && this.computeWorkElapsedMs(nowMs) >= this.effectiveWorkLimitMs()) {
        this.enterRest(nowMs)
        return
      }
    } else {
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

  /**
   * 专注会话：仅 working 时可延长本段阈值（分钟）。
   * 返回是否生效。
   */
  extendWork(minutes: number, nowMs = Date.now()): boolean {
    this.lastNowMs = nowMs
    if (this.phase !== 'working' || minutes <= 0) {
      this.emit(nowMs)
      return false
    }
    this.workBonusMs += Math.floor(minutes) * 60_000
    this.emit(nowMs)
    return true
  }

  continueWork(nowMs = Date.now()): void {
    this.lastNowMs = nowMs
    if (this.phase !== 'awaitContinue' && this.phase !== 'resting') {
      this.emit(nowMs)
      return
    }
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
    this.workBonusMs = 0
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
    if (this.computeWorkElapsedMs(nowMs) >= this.effectiveWorkLimitMs()) {
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
    return Math.max(0, nowMs - this.workSegmentStartedAt)
  }

  private computeWorkRemainingMs(nowMs: number, workElapsedMs = this.computeWorkElapsedMs(nowMs)): number {
    if (this.phase !== 'working') {
      return 0
    }
    return Math.max(0, this.effectiveWorkLimitMs() - workElapsedMs)
  }

  private computeRestRemainingMs(nowMs: number): number {
    if (this.phase === 'resting') {
      return Math.max(0, this.restEndsAt - nowMs)
    }
    return 0
  }

  private effectiveWorkLimitMs(): number {
    return this.config.workMinutes * 60_000 + this.workBonusMs
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
    restMinutes: Math.max(1, Math.floor(config.restMinutes)),
    preRestWarnMinutes: Math.max(1, Math.floor(config.preRestWarnMinutes ?? 2))
  }
}
