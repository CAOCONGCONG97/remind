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
}

export interface EngineSnapshot {
  phase: EnginePhase
  /** 当前工作已累计毫秒（累计模式）或自本段起点经过的毫秒（固定间隔，含锁屏墙钟） */
  workElapsedMs: number
  /** 休息剩余毫秒；非休息阶段为 0 */
  restRemainingMs: number
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
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'passwordHash'> & { passwordHash: string } = {
  triggerMode: 'fixed',
  workMinutes: 60,
  restMinutes: 5,
  passwordHash: '',
  autoStart: true,
  dailyShutdownEnabled: false,
  shutdownTime: '23:30',
  shutdownWarnMinutes: 5,
  shutdownCancelledDate: '',
  shutdownSkipNext: false
}

export function settingsToEngineConfig(settings: Pick<AppSettings, 'triggerMode' | 'workMinutes' | 'restMinutes'>): EngineConfig {
  return {
    triggerMode: settings.triggerMode,
    workMinutes: Math.max(1, settings.workMinutes),
    restMinutes: Math.max(1, settings.restMinutes)
  }
}
