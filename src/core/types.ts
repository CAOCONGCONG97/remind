/** 触发模式：固定间隔或累计会话时长 */
export type TriggerMode = 'fixed' | 'cumulative'

/** 引擎阶段 */
export type EnginePhase = 'working' | 'resting' | 'awaitContinue'

export interface EngineConfig {
  triggerMode: TriggerMode
  /** 工作间隔 / 累计阈值（分钟） */
  workMinutes: number
  /** 休息时长（分钟） */
  restMinutes: number
  /** 休息前提醒提前量（分钟），默认 2 */
  preRestWarnMinutes: number
}

export interface EngineSnapshot {
  phase: EnginePhase
  /** 当前工作已累计毫秒 */
  workElapsedMs: number
  /** 距触发休息剩余毫秒；非 working 为 0 */
  workRemainingMs: number
  /** 休息剩余毫秒；非休息阶段为 0 */
  restRemainingMs: number
  /** 是否处于休息前提醒窗口（仍在 working） */
  preRestWarning: boolean
  /** 本段已叠加的延长毫秒 */
  workBonusMs: number
  /** 是否因锁屏/睡眠暂停累计 */
  sessionPaused: boolean
  config: EngineConfig
}

export type EngineListener = (snapshot: EngineSnapshot) => void

export type CancelShutdownScope = 'once' | 'today'

export interface AppSettings {
  triggerMode: TriggerMode
  workMinutes: number
  restMinutes: number
  /** 休息前提醒提前分钟数 */
  preRestWarnMinutes: number
  /** scrypt 哈希串；空表示尚未设置 */
  passwordHash: string
  autoStart: boolean
  dailyShutdownEnabled: boolean
  /** HH:mm */
  shutdownTime: string
  /** 关机前提醒提前分钟数 */
  shutdownWarnMinutes: number
  /** 「当天」取消关机所覆盖的本地日期 YYYY-MM-DD；空表示无 */
  shutdownCancelledDate: string
  /** 是否已取消「下一次」计划关机 */
  shutdownSkipNext: boolean
  /** 推迟关机至该时间戳（ms）；0 表示无推迟 */
  shutdownDeferredUntil: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  triggerMode: 'fixed',
  workMinutes: 60,
  restMinutes: 5,
  preRestWarnMinutes: 2,
  passwordHash: '',
  autoStart: true,
  dailyShutdownEnabled: false,
  shutdownTime: '23:30',
  shutdownWarnMinutes: 5,
  shutdownCancelledDate: '',
  shutdownSkipNext: false,
  shutdownDeferredUntil: 0
}

export function settingsToEngineConfig(
  settings: Pick<AppSettings, 'triggerMode' | 'workMinutes' | 'restMinutes' | 'preRestWarnMinutes'>
): EngineConfig {
  return {
    triggerMode: settings.triggerMode,
    workMinutes: Math.max(1, settings.workMinutes),
    restMinutes: Math.max(1, settings.restMinutes),
    preRestWarnMinutes: Math.max(1, settings.preRestWarnMinutes ?? 2)
  }
}

export function formatDurationZh(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainMin = minutes % 60
    return `${hours} 小时 ${remainMin} 分`
  }
  if (minutes > 0) {
    return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`
  }
  return `${seconds} 秒`
}
