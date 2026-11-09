import { describe, expect, it } from 'vitest'
import { RestEngine } from '../src/core/engine'

const MIN = 60_000

describe('RestEngine fixed interval', () => {
  it('triggers rest after work interval', () => {
    const engine = new RestEngine({ triggerMode: 'fixed', workMinutes: 60, restMinutes: 5 }, 0)
    engine.tick(59 * MIN)
    expect(engine.snapshot(59 * MIN).phase).toBe('working')
    engine.tick(60 * MIN)
    expect(engine.snapshot(60 * MIN).phase).toBe('resting')
  })

  it('enters rest immediately on unlock when overdue across lock', () => {
    const engine = new RestEngine({ triggerMode: 'fixed', workMinutes: 60, restMinutes: 5 }, 0)
    engine.pauseSession(30 * MIN)
    engine.resumeSession(70 * MIN)
    expect(engine.snapshot(70 * MIN).phase).toBe('resting')
  })

  it('does not auto-dismiss after countdown; awaitContinue until continueWork', () => {
    const engine = new RestEngine({ triggerMode: 'fixed', workMinutes: 1, restMinutes: 5 }, 0)
    engine.tick(1 * MIN)
    expect(engine.snapshot().phase).toBe('resting')
    engine.tick(1 * MIN + 5 * MIN)
    expect(engine.snapshot().phase).toBe('awaitContinue')
    expect(engine.snapshot().restRemainingMs).toBe(0)
    engine.continueWork(1 * MIN + 5 * MIN + 1000)
    expect(engine.snapshot().phase).toBe('working')
  })

  it('emergencySkip returns to working immediately', () => {
    const engine = new RestEngine({ triggerMode: 'fixed', workMinutes: 1, restMinutes: 5 }, 0)
    engine.startRestNow(1000)
    expect(engine.snapshot().phase).toBe('resting')
    engine.emergencySkip(2000)
    expect(engine.snapshot().phase).toBe('working')
  })

  it('startRestNow forces rest while working', () => {
    const engine = new RestEngine({ triggerMode: 'fixed', workMinutes: 60, restMinutes: 5 }, 0)
    engine.startRestNow(10_000)
    expect(engine.snapshot().phase).toBe('resting')
  })
})

describe('RestEngine cumulative', () => {
  it('triggers when cumulative active time reaches threshold', () => {
    const engine = new RestEngine({ triggerMode: 'cumulative', workMinutes: 60, restMinutes: 5 }, 0)
    engine.tick(30 * MIN)
    expect(engine.snapshot().phase).toBe('working')
    engine.tick(60 * MIN)
    expect(engine.snapshot().phase).toBe('resting')
  })

  it('pauses accumulation while locked and resumes after unlock', () => {
    const engine = new RestEngine({ triggerMode: 'cumulative', workMinutes: 60, restMinutes: 5 }, 0)
    engine.tick(40 * MIN)
    engine.pauseSession(40 * MIN)
    engine.tick(100 * MIN)
    expect(engine.snapshot(100 * MIN).phase).toBe('working')
    expect(engine.snapshot(100 * MIN).workElapsedMs).toBe(40 * MIN)
    engine.resumeSession(100 * MIN)
    engine.tick(100 * MIN + 20 * MIN)
    expect(engine.snapshot(120 * MIN).phase).toBe('resting')
  })

  it('resets cumulative bank after continueWork', () => {
    const engine = new RestEngine({ triggerMode: 'cumulative', workMinutes: 1, restMinutes: 1 }, 0)
    engine.tick(1 * MIN)
    engine.tick(2 * MIN)
    expect(engine.snapshot().phase).toBe('awaitContinue')
    engine.continueWork(2 * MIN)
    expect(engine.snapshot(2 * MIN).workElapsedMs).toBe(0)
    expect(engine.snapshot(2 * MIN).phase).toBe('working')
  })
})
