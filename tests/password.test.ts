import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/core/password'

describe('password', () => {
  it('hashes and verifies matching password', () => {
    const hash = hashPassword('紧急口令-测试')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(verifyPassword('紧急口令-测试', hash)).toBe(true)
  })

  it('rejects wrong password', () => {
    const hash = hashPassword('correct-horse')
    expect(verifyPassword('wrong-battery', hash)).toBe(false)
  })

  it('rejects empty password on hash', () => {
    expect(() => hashPassword('')).toThrow(/不能为空/)
  })

  it('rejects empty or malformed stored hash on verify', () => {
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'not-a-hash')).toBe(false)
  })
})
