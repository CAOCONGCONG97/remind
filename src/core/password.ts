import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const SALT_LEN = 16

/**
 * 将明文密码哈希为可持久化字符串：scrypt$N$r$p$saltHex$hashHex
 * 仅用于本地「一时手痒」防护，非防专业破解。
 */
export function hashPassword(plain: string): string {
  if (!plain) {
    throw new Error('密码不能为空')
  }
  const salt = randomBytes(SALT_LEN)
  const derived = scryptSync(plain, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

/** 校验明文是否匹配已存哈希 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) {
    return false
  }
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4], 'hex')
  const expected = Buffer.from(parts[5], 'hex')
  if (!salt.length || !expected.length || !Number.isFinite(N)) {
    return false
  }
  const actual = scryptSync(plain, salt, expected.length, { N, r, p })
  if (actual.length !== expected.length) {
    return false
  }
  return timingSafeEqual(actual, expected)
}
