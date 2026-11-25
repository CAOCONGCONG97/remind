import { describe, expect, it } from 'vitest'
import {
  evaluateDailyShutdown,
  localDateKey,
  shutdownSlotKey,
  todayShutdownDate
} from '../src/core/shutdown-schedule'

/** 构造本地墙钟 Date：年月日来自 base，时分秒显式指定 */
function atLocal(base: Date, hour: number, minute: number, second = 0): Date {
  const date = new Date(base)
  date.setHours(hour, minute, second, 0)
  return date
}

describe('todayShutdownDate', () => {
  it('parses HH:mm onto today', () => {
    const now = new Date(2026, 10, 24, 12, 0, 0)
    const target = todayShutdownDate(now, '18:20')
    expect(target).not.toBeNull()
    expect(target!.getFullYear()).toBe(2026)
    expect(target!.getMonth()).toBe(10)
    expect(target!.getDate()).toBe(24)
    expect(target!.getHours()).toBe(18)
    expect(target!.getMinutes()).toBe(20)
  })

  it('returns null for invalid time', () => {
    expect(todayShutdownDate(new Date(), '25:00')).toBeNull()
    expect(todayShutdownDate(new Date(), 'nope')).toBeNull()
  })
})

describe('evaluateDailyShutdown — late boot must not shut down', () => {
  const day = new Date(2026, 10, 24, 12, 0, 0)
  const shutdownTime = '18:20'
  const today = localDateKey(day)
  const slotKey = shutdownSlotKey(today, shutdownTime)

  const baseInput = {
    enabled: true,
    shutdownTime,
    warnMinutes: 5,
    cancelledDate: '',
    skipNext: false,
    deferredUntil: 0,
    armedSlotKey: ''
  }

  it('skips shutdown when app starts after scheduled time (unarmed)', () => {
    const now = atLocal(day, 20, 7, 0)
    const decision = evaluateDailyShutdown({ ...baseInput, nowMs: now.getTime(), armedSlotKey: '' })
    expect(decision.kind).toBe('missedSlot')
    if (decision.kind === 'missedSlot') {
      expect(decision.slotKey).toBe(slotKey)
    }
  })

  it('skips shutdown when app starts exactly at scheduled time without prior arm', () => {
    const now = atLocal(day, 18, 20, 0)
    const decision = evaluateDailyShutdown({ ...baseInput, nowMs: now.getTime(), armedSlotKey: '' })
    expect(decision.kind).toBe('missedSlot')
  })

  it('skips shutdown one second after scheduled time without prior arm', () => {
    const now = atLocal(day, 18, 20, 1)
    const decision = evaluateDailyShutdown({ ...baseInput, nowMs: now.getTime(), armedSlotKey: '' })
    expect(decision.kind).toBe('missedSlot')
  })

  it('fires shutdown when armed and time has passed (ran through warn window)', () => {
    const now = atLocal(day, 18, 20, 0)
    const decision = evaluateDailyShutdown({
      ...baseInput,
      nowMs: now.getTime(),
      armedSlotKey: slotKey
    })
    expect(decision.kind).toBe('shutdown')
  })

  it('shows warn inside the pre-shutdown window and exposes slotKey for arming', () => {
    const now = atLocal(day, 18, 16, 0)
    const decision = evaluateDailyShutdown({ ...baseInput, nowMs: now.getTime(), armedSlotKey: '' })
    expect(decision.kind).toBe('warn')
    if (decision.kind === 'warn') {
      expect(decision.deferred).toBe(false)
      expect(decision.slotKey).toBe(slotKey)
      expect(decision.remainingMs).toBe(4 * 60_000)
      expect(decision.shutdownAtLabel).toBe('18:20')
    }
  })

  it('hides warn well before the window', () => {
    const now = atLocal(day, 10, 0, 0)
    const decision = evaluateDailyShutdown({ ...baseInput, nowMs: now.getTime(), armedSlotKey: '' })
    expect(decision.kind).toBe('hideWarn')
  })

  it('does nothing when daily shutdown disabled', () => {
    const now = atLocal(day, 20, 0, 0)
    const decision = evaluateDailyShutdown({
      ...baseInput,
      enabled: false,
      nowMs: now.getTime()
    })
    expect(decision.kind).toBe('noop')
  })

  it('does nothing when cancelled for today even if past time', () => {
    const now = atLocal(day, 20, 0, 0)
    const decision = evaluateDailyShutdown({
      ...baseInput,
      nowMs: now.getTime(),
      cancelledDate: today,
      armedSlotKey: slotKey
    })
    expect(decision.kind).toBe('noop')
  })

  it('consumes skipNext when past without firing', () => {
    const now = atLocal(day, 18, 21, 0)
    const decision = evaluateDailyShutdown({
      ...baseInput,
      nowMs: now.getTime(),
      skipNext: true,
      armedSlotKey: slotKey
    })
    expect(decision.kind).toBe('consumeSkipNext')
  })

  it('fires deferred shutdown when defer deadline passed', () => {
    const now = atLocal(day, 19, 0, 0)
    const decision = evaluateDailyShutdown({
      ...baseInput,
      nowMs: now.getTime(),
      deferredUntil: now.getTime() - 1000
    })
    expect(decision.kind).toBe('shutdown')
    if (decision.kind === 'shutdown') {
      expect(decision.clearDeferred).toBe(true)
    }
  })
})
