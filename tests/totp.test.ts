import { describe, expect, it } from 'vitest'
import { buildOtpAuthUri, parseOtpAuthUri } from '../src/shared/otpauth'
import { decodeBase32, encodeBase32, generateTotp, normalizeBase32 } from '../src/shared/totp'

describe('base32', () => {
  it('round-trips', () => {
    const original = Buffer.from('Hello!')
    expect(decodeBase32(encodeBase32(original)).equals(original)).toBe(true)
  })

  it('normalizes spaces', () => {
    expect(normalizeBase32('jbsw y3dp ehpk 3pxp')).toBe('JBSWY3DPEHPK3PXP')
  })
})

describe('totp', () => {
  // RFC 6238 附录 B：secret = "12345678901234567890" (ASCII)，SHA1，digits=8
  it('matches RFC 6238 SHA1 sample at fixed time', () => {
    const secretAscii = Buffer.from('12345678901234567890')
    const secret = encodeBase32(secretAscii)
    const result = generateTotp(secret, {
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      nowMs: 59 * 1000
    })
    expect(result.code).toBe('94287082')
  })

  it('defaults to 6 digits / 30s', () => {
    const result = generateTotp('JBSWY3DPEHPK3PXP', { nowMs: 0 })
    expect(result.code).toHaveLength(6)
    expect(result.period).toBe(30)
    expect(result.remainingSec).toBe(30)
  })
})

describe('otpauth', () => {
  it('parses standard uri', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30&algorithm=SHA1'
    )
    expect(parsed.issuer).toBe('GitHub')
    expect(parsed.label).toBe('octocat')
    expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(parsed.algorithm).toBe('SHA1')
  })

  it('builds uri that round-trips', () => {
    const uri = buildOtpAuthUri({
      issuer: 'Demo',
      label: 'user@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30
    })
    const parsed = parseOtpAuthUri(uri)
    expect(parsed.issuer).toBe('Demo')
    expect(parsed.label).toBe('user@example.com')
    expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP')
  })
})
