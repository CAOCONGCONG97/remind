/**
 * 每日关机调度决策（纯函数，便于单测）。
 *
 * 关键不变量：若进程启动时今日关机时刻已过，且本进程从未进入过今日提醒窗口，
 * 则不得立即关机——跳过今日，等待次日同一时刻。
 */

export type DailyShutdownDecision =
  | { kind: 'noop' }
  | {
      kind: 'warn'
      remainingMs: number
      shutdownAtLabel: string
      slotKey: string
      deferred: boolean
    }
  | { kind: 'hideWarn' }
  | { kind: 'shutdown'; reason?: string; clearDeferred?: boolean }
  | { kind: 'consumeSkipNext'; clearDeferred?: boolean }
  | { kind: 'missedSlot'; slotKey: string }

export interface DailyShutdownInput {
  enabled: boolean
  nowMs: number
  /** HH:mm */
  shutdownTime: string
  warnMinutes: number
  /** YYYY-MM-DD；「当天取消」覆盖日 */
  cancelledDate: string
  skipNext: boolean
  deferredUntil: number
  /**
   * 本进程已「武装」的今日档期 key（通常在进入提前提醒窗口时写入）。
   * 未武装却已过点 → 视为开机/登录过晚，跳过今日。
   */
  armedSlotKey: string
}

/** 本地日历日 YYYY-MM-DD */
export function localDateKey(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 今日（或给定 now）的关机墙钟时刻；解析失败返回 null */
export function todayShutdownDate(now: Date, hhmm: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  const target = new Date(now)
  target.setSeconds(0, 0)
  target.setHours(hour, minute, 0, 0)
  return target
}

export function formatClockLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function shutdownSlotKey(dateKey: string, hhmm: string): string {
  return `${dateKey}@${hhmm}`
}

/**
 * 根据当前时刻与武装状态，决定本 tick 应警告、关机、跳过还是空转。
 */
export function evaluateDailyShutdown(input: DailyShutdownInput): DailyShutdownDecision {
  if (!input.enabled) {
    return { kind: 'noop' }
  }

  const now = new Date(input.nowMs)
  const today = localDateKey(now)
  if (input.cancelledDate === today) {
    return { kind: 'noop' }
  }

  if (input.deferredUntil > input.nowMs) {
    const remainingMs = input.deferredUntil - input.nowMs
    const label = formatClockLabel(new Date(input.deferredUntil))
    return {
      kind: 'warn',
      remainingMs,
      shutdownAtLabel: label,
      slotKey: `defer:${input.deferredUntil}`,
      deferred: true
    }
  }

  if (input.deferredUntil > 0 && input.deferredUntil <= input.nowMs) {
    if (input.skipNext) {
      return { kind: 'consumeSkipNext', clearDeferred: true }
    }
    return {
      kind: 'shutdown',
      reason: '强制休息提醒：推迟后的关机时刻已到',
      clearDeferred: true
    }
  }

  const target = todayShutdownDate(now, input.shutdownTime)
  if (!target) {
    return { kind: 'noop' }
  }

  const remainingMs = target.getTime() - input.nowMs
  const slotKey = shutdownSlotKey(today, input.shutdownTime)
  const warnMs = Math.max(1, input.warnMinutes) * 60_000

  if (remainingMs <= 0) {
    if (input.skipNext) {
      return { kind: 'consumeSkipNext' }
    }
    // 仅当本进程已进入过今日提醒窗口（或等价武装）才执行到点关机；
    // 否则是开机/登录晚于设定时刻——跳过今日，避免静默立刻关机。
    if (input.armedSlotKey === slotKey) {
      return { kind: 'shutdown' }
    }
    return { kind: 'missedSlot', slotKey }
  }

  if (remainingMs <= warnMs) {
    return {
      kind: 'warn',
      remainingMs,
      shutdownAtLabel: formatClockLabel(target),
      slotKey,
      deferred: false
    }
  }

  return { kind: 'hideWarn' }
}
